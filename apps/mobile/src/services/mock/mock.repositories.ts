import { ApiError } from '../../lib/ApiError';
import { isValidStartDay } from '../../lib/bookingDays';
import { MANDATORY_KYC_DOC_TYPES } from '../../types/api';
import type {
    ApiBooking, ApiDocument, ApiKycDetail, ApiKycQueueItem, ApiKycSummary, ApiMe, ApiSignedUrl,
    ApiStation, ApiUser, ApiUserDetail, ApiVehicleModel, ApiVehicleModelDetail, BookingStatus,
    CreateBookingPayload, CreateUserPayload, KycStatus, ListUsersParams, ListVehicleModelsParams,
    LocalFile, Paginated, RoleName, StatusAction, UpdateUserPayload, VerificationStatus,
} from '../../types/api';
import type {
    AuthRepository, BookingRepository, KycQueueParams, KycRepository, SessionRef,
    UpdateDocumentInput, UploadDocumentInput, UploadPhotoResult, UserRepository,
    VehicleCatalogRepository,
} from '../types';
import {
    DEMO_ACCOUNTS, MockAuditRow, MockDocumentRow, MockUserRow, PLACEHOLDER_IMAGE,
    SEED_AUDIT, SEED_DOCUMENTS, SEED_STATIONS, SEED_USERS, SEED_VEHICLE_MODELS,
    SEED_VEHICLE_MODELS_DETAIL,
} from './seed';

// ---------------------------------------------------------------------------
// In-memory database
// ---------------------------------------------------------------------------

/**
 * Lives for the lifetime of the JS bundle: edits survive navigation but reset
 * on reload. That is deliberate — a mock that persists is a mock you start
 * debugging instead of the app.
 */
interface MockBookingRow {
    id: string;
    user_id: string;
    vehicle_model_id: string;
    station_id: string;
    plan_id: string;
    start_day: string;
    status: BookingStatus;
    created_at: string;
}

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['pending_payment', 'confirmed'];

const db = {
    users: SEED_USERS.map((u) => ({ ...u })),
    documents: SEED_DOCUMENTS.map((d) => ({ ...d })),
    audit: SEED_AUDIT.map((a) => ({ ...a })),
    bookings: [] as MockBookingRow[],
    currentUserId: null as string | null,
};

/** Mimics a real round trip so loading states and spinners actually appear. */
const delay = (ms = 320) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const isExpired = (date: string | null) => !!date && date < today();
const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;

const normEmail = (e: string) => e.trim().toLowerCase();
const normPhone = (p: string) => p.replace(/[\s()-]/g, '');

const maskDocNumber = (value: string | null): string | null => {
    if (!value) return null;
    if (value.length <= 4) return '*'.repeat(value.length);
    return '*'.repeat(value.length - 4) + value.slice(-4);
};

function audit(action: string, targetUserId: string, after?: Record<string, unknown>) {
    db.audit.unshift({
        id: uid('a'),
        action,
        actor_id: db.currentUserId,
        target_user_id: targetUserId,
        created_at: nowIso(),
        after_data: after ?? null,
    });
}

function requireSession(): MockUserRow {
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    return user;
}

const isStaffRow = (u: MockUserRow) => u.roles.some((r) => r !== 'rider');
const isAdminRow = (u: MockUserRow) => u.roles.includes('admin');

function requireAdmin(): MockUserRow {
    const actor = requireSession();
    if (!isAdminRow(actor)) {
        throw new ApiError(403, 'FORBIDDEN', 'This action requires the admin role.');
    }
    return actor;
}

function requireStaff(): MockUserRow {
    const actor = requireSession();
    if (!isStaffRow(actor)) {
        throw new ApiError(403, 'FORBIDDEN', 'This action requires a staff or admin role.');
    }
    return actor;
}

/**
 * Mirrors public.compute_kyc_status() and deriveKycStatus() on the backend.
 * Rejection outranks everything; verified needs every mandatory type verified
 * AND unexpired.
 */
function computeKycStatus(userId: string): KycStatus {
    const docs = db.documents.filter(
        (d) => d.user_id === userId && MANDATORY_KYC_DOC_TYPES.includes(d.doc_type),
    );
    if (docs.length === 0) return 'not_submitted';
    if (docs.some((d) => d.verification_status === 'rejected')) return 'rejected';

    const verified = docs.filter(
        (d) => d.verification_status === 'verified' && !isExpired(d.expiry_date),
    ).length;

    if (verified === MANDATORY_KYC_DOC_TYPES.length) return 'verified';
    if (verified > 0) return 'partially_verified';
    return 'pending';
}

function completionPercent(userId: string): number {
    const verified = MANDATORY_KYC_DOC_TYPES.filter((type) =>
        db.documents.some(
            (d) =>
                d.user_id === userId &&
                d.doc_type === type &&
                d.verification_status === 'verified' &&
                !isExpired(d.expiry_date),
        ),
    ).length;
    return Math.round((verified / MANDATORY_KYC_DOC_TYPES.length) * 100);
}

// --- projections (row -> API shape) ----------------------------------------

function toApiUser(row: MockUserRow): ApiUser {
    const { ...rest } = row;
    return { ...rest, kyc_status: computeKycStatus(row.id) };
}

function toApiDocument(row: MockDocumentRow, reveal: boolean): ApiDocument {
    return {
        id: row.id,
        doc_type: row.doc_type,
        doc_number: reveal ? row.doc_number : maskDocNumber(row.doc_number),
        verification_status: row.verification_status,
        rejection_reason: row.rejection_reason,
        expiry_date: row.expiry_date,
        is_expired: isExpired(row.expiry_date),
        submitted_at: row.submitted_at,
        verified_at: row.verified_at,
        has_back_side: !!row.back_uri,
        created_at: row.created_at,
    };
}

function toApiUserDetail(row: MockUserRow): ApiUserDetail {
    const docs = db.documents.filter((d) => d.user_id === row.id);
    return {
        ...toApiUser(row),
        kyc_completion_percent: completionPercent(row.id),
        documents: docs.map((d) => ({
            id: d.id,
            doc_type: d.doc_type,
            doc_number_masked: maskDocNumber(d.doc_number),
            verification_status: d.verification_status,
            rejection_reason: d.rejection_reason,
            expiry_date: d.expiry_date,
            submitted_at: d.submitted_at,
            verified_at: d.verified_at,
        })),
    };
}

function findUser(id: string): MockUserRow {
    const row = db.users.find((u) => u.id === id);
    if (!row) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
    return row;
}

function findLiveUser(id: string): MockUserRow {
    const row = findUser(id);
    if (row.deleted_at) {
        throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This account is deleted. Restore it first.');
    }
    return row;
}

function assertEmailPhoneFree(email?: string, phone?: string, exceptId?: string) {
    if (email) {
        const clash = db.users.some(
            (u) => !u.deleted_at && u.id !== exceptId && u.email?.toLowerCase() === normEmail(email),
        );
        if (clash) {
            throw new ApiError(409, 'CONFLICT', 'This email is already registered.', {
                email: 'This email is already registered.',
            });
        }
    }
    if (phone) {
        const clash = db.users.some(
            (u) => !u.deleted_at && u.id !== exceptId && u.phone === normPhone(phone),
        );
        if (clash) {
            throw new ApiError(409, 'CONFLICT', 'This phone number is already registered.', {
                phone: 'This phone number is already registered.',
            });
        }
    }
}

function assertNotLastAdmin(userId: string) {
    const activeAdmins = db.users.filter(
        (u) => !u.deleted_at && u.account_status === 'active' && u.roles.includes('admin'),
    );
    if (activeAdmins.length <= 1 && activeAdmins.some((u) => u.id === userId)) {
        throw new ApiError(
            422,
            'BUSINESS_RULE_VIOLATION',
            'This is the last active administrator. Promote another admin first.',
        );
    }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export class MockAuthRepository implements AuthRepository {
    readonly requiresPassword = false;
    readonly isMock = true;

    /** Remembers the number a code was "sent" to, so verify can sanity-check. */
    private pendingPhone: string | null = null;

    async restore(): Promise<SessionRef | null> {
        await delay(120);
        // Sessions are not persisted in mock mode: every launch starts at login,
        // which is what you want when demoing role differences.
        return null;
    }

    // In mock mode any code works; the fixed demo code is 123456. No SMS is sent.
    async requestPhoneOtp(phone: string): Promise<void> {
        await delay();
        this.pendingPhone = normPhone(phone);
    }

    async verifyPhoneOtp(phone: string, code: string): Promise<SessionRef> {
        await delay();
        if (!/^\d{6}$/.test(code.trim())) {
            throw new ApiError(400, 'VALIDATION_ERROR', 'Enter the 6-digit code. (Demo code: 123456)');
        }
        if (code.trim() !== '123456') {
            throw new ApiError(401, 'UNAUTHENTICATED', 'That code is not correct. In demo mode the code is 123456.');
        }
        const digits = normPhone(phone).replace(/[^\d]/g, '');
        let user = db.users.find((u) => (u.phone ?? '').replace(/[^\d]/g, '') === digits);
        if (!user) {
            // No seeded rider at this number: mirror production's
            // shouldCreateUser=true — a brand-new blank profile, which is what
            // drives the profile-setup/onboarding routing in _layout.tsx.
            user = {
                id: uid('u'),
                full_name: '',
                email: null,
                phone: digits ? `+${digits}` : normPhone(phone),
                date_of_birth: null,
                gender: null,
                address_line_1: null,
                address_line_2: null,
                city: null,
                state: null,
                postal_code: null,
                country: 'IN',
                emergency_contact_name: null,
                emergency_contact_phone: null,
                account_status: 'active',
                profile_photo_url: null,
                profile_completed: false,
                created_at: nowIso(),
                updated_at: nowIso(),
                deleted_at: null,
                roles: ['rider'],
                assigned_vehicle: null,
                current_plan: null,
            };
            db.users.push(user);
        }
        this.pendingPhone = null;
        db.currentUserId = user.id;
        return { id: user.id, email: user.email };
    }

    async signInWithGoogle(): Promise<SessionRef> {
        await delay();
        // Demo: Google maps to the standard demo rider.
        const user =
            db.users.find((u) => u.email === 'rider@fleet.com') ?? db.users[0];
        if (!user) throw new ApiError(404, 'NOT_FOUND', 'No demo rider to sign in as.');
        db.currentUserId = user.id;
        return { id: user.id, email: user.email };
    }

    async signIn(email: string, _password?: string): Promise<SessionRef> {
        await delay();
        const user = db.users.find((u) => u.email?.toLowerCase() === normEmail(email));

        if (!user) {
            throw new ApiError(
                401,
                'UNAUTHENTICATED',
                `No demo account for "${email}". Try ${DEMO_ACCOUNTS.map((d) => d.email).join(', ')}.`,
            );
        }
        if (user.deleted_at) throw new ApiError(403, 'FORBIDDEN', 'This account has been deactivated.');
        if (user.account_status === 'suspended') throw new ApiError(403, 'FORBIDDEN', 'This account is suspended.');

        db.currentUserId = user.id;
        return { id: user.id, email: user.email };
    }

    async signOut(): Promise<void> {
        db.currentUserId = null;
    }

    async sendPasswordReset(): Promise<void> {
        await delay();
        // No-op: there are no passwords to reset in mock mode.
    }

    subscribe(): () => void {
        return () => {};
    }
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export class MockUserRepository implements UserRepository {
    async me(): Promise<ApiMe> {
        await delay(160);
        const row = requireSession();
        const detail = toApiUserDetail(row);
        return {
            ...detail,
            can_rent: detail.kyc_status === 'verified' && row.account_status === 'active',
            is_admin: isAdminRow(row),
            // No rental system in the mock db yet (booking flow is a later
            // phase) — an assigned scooter is the closest existing stand-in
            // for "has a live rental" so the post-booking dashboard demoes.
            has_active_rental: !!row.assigned_vehicle,
            has_active_booking: db.bookings.some(
                (b) => b.user_id === row.id && ACTIVE_BOOKING_STATUSES.includes(b.status),
            ),
        };
    }

    async updateMe(patch: UpdateUserPayload): Promise<ApiUserDetail> {
        await delay();
        const row = requireSession();
        return this.update(row.id, patch);
    }

    async uploadMyPhoto(photo: LocalFile): Promise<UploadPhotoResult> {
        await delay(500);
        const row = requireSession();
        row.profile_photo_url = photo.uri;
        row.updated_at = nowIso();
        audit('user.photo_uploaded', row.id);
        return { profile_photo_url: photo.uri };
    }

    async myPhotoUrl(): Promise<ApiSignedUrl> {
        await delay(150);
        const row = requireSession();
        if (!row.profile_photo_url) throw new ApiError(404, 'NOT_FOUND', 'No profile photo has been uploaded yet.');
        return { url: row.profile_photo_url, expires_in: 300 };
    }

    async list(params: ListUsersParams): Promise<Paginated<ApiUser>> {
        await delay();
        const actor = requireStaff();

        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;
        const includeDeleted = !!params.includeDeleted && isAdminRow(actor);

        let rows = db.users.filter((u) => (includeDeleted ? true : !u.deleted_at));

        if (params.accountStatus) rows = rows.filter((u) => u.account_status === params.accountStatus);
        if (params.kycStatus) rows = rows.filter((u) => computeKycStatus(u.id) === params.kycStatus);
        if (params.role) rows = rows.filter((u) => u.roles.includes(params.role!));

        if (params.search) {
            const q = params.search.trim().toLowerCase();
            // Document-number search too, matching the backend's behaviour.
            const idsByDoc = new Set(
                db.documents.filter((d) => d.doc_number.toLowerCase().includes(q)).map((d) => d.user_id),
            );
            rows = rows.filter(
                (u) =>
                    u.full_name.toLowerCase().includes(q) ||
                    (u.email ?? '').toLowerCase().includes(q) ||
                    (u.phone ?? '').includes(q) ||
                    idsByDoc.has(u.id),
            );
        }

        const sortBy = params.sortBy ?? 'created_at';
        const dir = params.sortDir === 'asc' ? 1 : -1;
        rows = [...rows].sort((a, b) => {
            const av = sortBy === 'full_name' ? a.full_name : sortBy === 'kyc_status' ? computeKycStatus(a.id) : a.created_at;
            const bv = sortBy === 'full_name' ? b.full_name : sortBy === 'kyc_status' ? computeKycStatus(b.id) : b.created_at;
            return av < bv ? -dir : av > bv ? dir : 0;
        });

        const total = rows.length;
        const start = (page - 1) * pageSize;

        return {
            data: rows.slice(start, start + pageSize).map(toApiUser),
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        };
    }

    async get(id: string): Promise<ApiUserDetail> {
        await delay(180);
        const actor = requireSession();
        const row = findUser(id);
        if (row.deleted_at && !isAdminRow(actor)) throw new ApiError(404, 'NOT_FOUND', 'User not found.');
        return toApiUserDetail(row);
    }

    async create(payload: CreateUserPayload): Promise<ApiUserDetail> {
        await delay(450);
        requireAdmin();

        const email = normEmail(payload.email);
        const phone = normPhone(payload.phone);
        assertEmailPhoneFree(email, phone);

        const row: MockUserRow = {
            id: uid('u'),
            full_name: payload.full_name.trim(),
            email,
            phone,
            date_of_birth: payload.date_of_birth ?? null,
            gender: payload.gender ?? null,
            address_line_1: payload.address_line_1 ?? null,
            address_line_2: payload.address_line_2 ?? null,
            city: payload.city ?? null,
            state: payload.state ?? null,
            postal_code: payload.postal_code ?? null,
            country: payload.country ?? 'IN',
            emergency_contact_name: payload.emergency_contact_name ?? null,
            emergency_contact_phone: payload.emergency_contact_phone
                ? normPhone(payload.emergency_contact_phone)
                : null,
            account_status: payload.account_status ?? 'active',
            profile_photo_url: null,
            // Admin-created accounts arrive with a full profile already.
            profile_completed: true,
            created_at: nowIso(),
            updated_at: nowIso(),
            deleted_at: null,
            roles: [payload.role ?? 'rider'],
            assigned_vehicle: null,
            current_plan: null,
        };

        db.users.unshift(row);
        audit('user.created', row.id, { email, role: row.roles[0] });
        return toApiUserDetail(row);
    }

    async update(id: string, patch: UpdateUserPayload): Promise<ApiUserDetail> {
        await delay();
        const actor = requireSession();
        const row = findLiveUser(id);

        if (row.id !== actor.id && !isStaffRow(actor)) {
            throw new ApiError(403, 'FORBIDDEN', 'You may only edit your own profile.');
        }

        assertEmailPhoneFree(patch.email, patch.phone, id);

        Object.assign(row, {
            ...patch,
            email: patch.email ? normEmail(patch.email) : row.email,
            phone: patch.phone ? normPhone(patch.phone) : row.phone,
            emergency_contact_phone: patch.emergency_contact_phone
                ? normPhone(patch.emergency_contact_phone)
                : row.emergency_contact_phone,
            // Mirrors the backend: any successful profile write completes onboarding.
            profile_completed: true,
            updated_at: nowIso(),
        });

        audit('user.updated', id, { fields: Object.keys(patch) });
        return toApiUserDetail(row);
    }

    async remove(id: string): Promise<void> {
        await delay();
        const actor = requireAdmin();
        const row = findLiveUser(id);

        if (id === actor.id) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'You cannot delete your own account.');
        }
        assertNotLastAdmin(id);

        // Soft delete: the scooter goes back to the fleet, history is kept.
        row.deleted_at = nowIso();
        row.account_status = 'inactive';
        row.assigned_vehicle = null;
        row.updated_at = nowIso();
        audit('user.soft_deleted', id);
    }

    async restore(id: string): Promise<ApiUserDetail> {
        await delay();
        requireAdmin();
        const row = findUser(id);

        if (!row.deleted_at) throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This account is not deleted.');
        // The address may have been claimed while the account was gone.
        assertEmailPhoneFree(row.email ?? undefined, row.phone ?? undefined, id);

        row.deleted_at = null;
        row.account_status = 'inactive'; // restored, not automatically re-activated
        row.updated_at = nowIso();
        audit('user.restored', id);
        return toApiUserDetail(row);
    }

    async changeStatus(id: string, action: StatusAction, reason?: string): Promise<ApiUserDetail> {
        await delay();
        const actor = requireStaff();
        const row = findLiveUser(id);

        const next = action === 'activate' ? 'active' : action === 'deactivate' ? 'inactive' : 'suspended';

        if (id === actor.id && action !== 'activate') {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'You cannot deactivate or suspend your own account.');
        }
        if (action === 'suspend' && (!reason || reason.trim().length < 5)) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A reason is required when suspending an account.', {
                reason: 'Give a reason of at least 5 characters.',
            });
        }
        if (action !== 'activate') assertNotLastAdmin(id);
        if (row.account_status === next) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', `This account is already ${next}.`);
        }

        if (action !== 'activate') row.assigned_vehicle = null;
        row.account_status = next;
        row.updated_at = nowIso();
        audit(`user.${action}d`, id, { reason: reason ?? null });
        return toApiUserDetail(row);
    }

    async getRoles(id: string): Promise<RoleName[]> {
        await delay(120);
        return [...findUser(id).roles];
    }

    async setRoles(id: string, roles: RoleName[]): Promise<RoleName[]> {
        await delay();
        const actor = requireAdmin();
        const row = findLiveUser(id);

        if (id === actor.id) {
            throw new ApiError(403, 'FORBIDDEN', 'You cannot change your own roles. Ask another administrator.');
        }
        if (roles.length === 0) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A user must keep at least one role.');
        }
        if (row.roles.includes('admin') && !roles.includes('admin')) assertNotLastAdmin(id);

        row.roles = [...roles];
        row.updated_at = nowIso();
        audit('user.roles_changed', id, { roles });
        return [...roles];
    }
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

function findDocument(documentId: string): MockDocumentRow {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
    return doc;
}

function kycSummaryFor(userId: string, reveal: boolean): ApiKycSummary {
    const docs = db.documents.filter((d) => d.user_id === userId);
    const missing = MANDATORY_KYC_DOC_TYPES.filter(
        (type) => !docs.some((d) => d.doc_type === type && d.verification_status !== 'rejected'),
    );
    return {
        user_id: userId,
        kyc_status: computeKycStatus(userId),
        completion_percent: completionPercent(userId),
        missing_document_types: missing,
        can_submit: missing.length === 0,
        documents: docs.map((d) => toApiDocument(d, reveal)),
    };
}

export class MockKycRepository implements KycRepository {
    async mine(): Promise<ApiKycSummary> {
        await delay(200);
        return kycSummaryFor(requireSession().id, true);
    }

    async uploadMine(input: UploadDocumentInput): Promise<ApiDocument> {
        // Longer, so the upload spinner is actually visible.
        await delay(700);
        const actor = requireSession();

        if (input.doc_type === 'driving_license') {
            if (!input.expiry_date) {
                throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A driving licence must include its expiry date.', {
                    expiry_date: 'Enter the licence expiry date.',
                });
            }
            if (isExpired(input.expiry_date)) {
                throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This driving licence has already expired.', {
                    expiry_date: 'This licence has expired.',
                });
            }
        }

        const existing = db.documents.find(
            (d) =>
                d.user_id === actor.id &&
                d.doc_type === input.doc_type &&
                (d.verification_status === 'pending' || d.verification_status === 'verified'),
        );
        if (existing) {
            throw new ApiError(
                409,
                'CONFLICT',
                existing.verification_status === 'verified'
                    ? 'This document is already verified and cannot be replaced.'
                    : 'A document of this type is already awaiting review.',
            );
        }

        const row: MockDocumentRow = {
            id: uid('d'),
            user_id: actor.id,
            doc_type: input.doc_type,
            doc_number: input.doc_number.trim().toUpperCase(),
            front_uri: input.front.uri,
            back_uri: input.back?.uri ?? null,
            verification_status: 'pending',
            rejection_reason: null,
            verified_by: null,
            verified_at: null,
            expiry_date: input.expiry_date ?? null,
            submitted_at: null,
            created_at: nowIso(),
            updated_at: nowIso(),
        };

        db.documents.push(row);
        audit('kyc.document_uploaded', actor.id, { doc_type: row.doc_type });
        return toApiDocument(row, false);
    }

    async updateMine(documentId: string, input: UpdateDocumentInput): Promise<ApiDocument> {
        await delay(700);
        const actor = requireSession();
        const doc = findDocument(documentId);

        if (doc.user_id !== actor.id) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
        if (doc.verification_status === 'verified') {
            throw new ApiError(
                422,
                'BUSINESS_RULE_VIOLATION',
                'A verified document cannot be changed. Contact support if it is wrong.',
            );
        }
        if (input.expiry_date && doc.doc_type === 'driving_license' && isExpired(input.expiry_date)) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This driving licence has already expired.', {
                expiry_date: 'This licence has expired.',
            });
        }

        if (input.doc_number) doc.doc_number = input.doc_number.trim().toUpperCase();
        if (input.expiry_date) doc.expiry_date = input.expiry_date;
        if (input.front) doc.front_uri = input.front.uri;
        if (input.back) doc.back_uri = input.back.uri;

        // Correcting a rejection puts it back in the queue with a clean slate.
        if (doc.verification_status === 'rejected') {
            doc.verification_status = 'pending';
            doc.rejection_reason = null;
            doc.verified_by = null;
            doc.verified_at = null;
            doc.submitted_at = nowIso();
        }
        doc.updated_at = nowIso();

        audit('kyc.document_updated', actor.id, { doc_type: doc.doc_type });
        return toApiDocument(doc, false);
    }

    async deleteMine(documentId: string): Promise<void> {
        await delay();
        const actor = requireSession();
        const doc = findDocument(documentId);

        if (doc.user_id !== actor.id) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
        if (doc.verification_status === 'verified') {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A verified document cannot be deleted.');
        }

        db.documents = db.documents.filter((d) => d.id !== documentId);
        audit('kyc.document_deleted', actor.id, { doc_type: doc.doc_type });
    }

    async myDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl> {
        await delay(200);
        const actor = requireSession();
        const doc = findDocument(documentId);
        if (doc.user_id !== actor.id) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
        return this.urlFor(doc, side);
    }

    async submitMine(): Promise<ApiKycSummary> {
        await delay(500);
        const actor = requireSession();
        const docs = db.documents.filter((d) => d.user_id === actor.id);

        const missing = MANDATORY_KYC_DOC_TYPES.filter(
            (type) => !docs.some((d) => d.doc_type === type && d.verification_status !== 'rejected'),
        );
        if (missing.length > 0) {
            throw new ApiError(
                422,
                'BUSINESS_RULE_VIOLATION',
                `Upload all required documents before submitting: ${missing.join(', ')}.`,
            );
        }
        if (computeKycStatus(actor.id) === 'verified') {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'Your KYC is already verified.');
        }

        const stamp = nowIso();
        for (const d of docs) {
            if (d.verification_status === 'pending' && !d.submitted_at) d.submitted_at = stamp;
        }
        audit('kyc.submitted', actor.id, { document_count: docs.length });
        return kycSummaryFor(actor.id, true);
    }

    async queue(params: KycQueueParams): Promise<Paginated<ApiKycQueueItem>> {
        await delay();
        requireStaff();

        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;

        let rows = db.users.filter((u) => !u.deleted_at);
        rows = params.status
            ? rows.filter((u) => computeKycStatus(u.id) === params.status)
            : rows.filter((u) => computeKycStatus(u.id) !== 'not_submitted');

        if (params.search) {
            const q = params.search.trim().toLowerCase();
            rows = rows.filter(
                (u) =>
                    u.full_name.toLowerCase().includes(q) ||
                    (u.email ?? '').toLowerCase().includes(q) ||
                    (u.phone ?? '').includes(q),
            );
        }
        if (params.docType) {
            rows = rows.filter((u) =>
                db.documents.some((d) => d.user_id === u.id && d.doc_type === params.docType),
            );
        }

        const items: ApiKycQueueItem[] = rows.map((u) => {
            const docs = db.documents.filter((d) => d.user_id === u.id);
            const submitted = docs.map((d) => d.submitted_at).filter((s): s is string => !!s).sort();
            return {
                user_id: u.id,
                full_name: u.full_name,
                email: u.email,
                phone: u.phone,
                kyc_status: computeKycStatus(u.id),
                completion_percent: completionPercent(u.id),
                document_count: docs.length,
                earliest_submitted_at: submitted[0] ?? null,
                has_expired_document: docs.some((d) => isExpired(d.expiry_date)),
            };
        });

        const total = items.length;
        const start = (page - 1) * pageSize;
        return {
            data: items.slice(start, start + pageSize),
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        };
    }

    async detail(userId: string): Promise<ApiKycDetail> {
        await delay(220);
        requireStaff();
        const row = findUser(userId);

        return {
            rider: {
                id: row.id,
                full_name: row.full_name,
                email: row.email,
                phone: row.phone,
                date_of_birth: row.date_of_birth,
                address_line_1: row.address_line_1,
                city: row.city,
                state: row.state,
                postal_code: row.postal_code,
                country: row.country,
                kyc_status: computeKycStatus(row.id),
                account_status: row.account_status,
            },
            kyc_status: computeKycStatus(row.id),
            completion_percent: completionPercent(row.id),
            // Staff reviewing a document see the real number, not a mask.
            documents: db.documents.filter((d) => d.user_id === userId).map((d) => toApiDocument(d, true)),
            history: db.audit
                .filter((a) => a.target_user_id === userId && a.action.startsWith('kyc.'))
                .map((a) => ({ id: a.id, action: a.action, actor_id: a.actor_id, created_at: a.created_at, after_data: a.after_data })),
        };
    }

    async reviewDocumentUrl(documentId: string, side: 'front' | 'back'): Promise<ApiSignedUrl> {
        await delay(200);
        requireStaff();
        return this.urlFor(findDocument(documentId), side);
    }

    async verifyDocument(documentId: string): Promise<ApiDocument> {
        await delay(400);
        const actor = requireStaff();
        const doc = findDocument(documentId);

        if (doc.user_id === actor.id) {
            throw new ApiError(403, 'FORBIDDEN', 'You cannot verify your own document.');
        }
        if (doc.verification_status === 'verified') {
            throw new ApiError(409, 'CONFLICT', 'This document is already verified.');
        }
        if (isExpired(doc.expiry_date)) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This document has expired and cannot be verified.');
        }

        doc.verification_status = 'verified';
        doc.rejection_reason = null;
        doc.verified_by = actor.id;
        doc.verified_at = nowIso();
        doc.updated_at = nowIso();

        audit('kyc.document_verified', doc.user_id, { doc_type: doc.doc_type });
        return toApiDocument(doc, true);
    }

    async rejectDocument(documentId: string, reason: string): Promise<ApiDocument> {
        await delay(400);
        const actor = requireStaff();
        const doc = findDocument(documentId);

        if (doc.user_id === actor.id) {
            throw new ApiError(403, 'FORBIDDEN', 'You cannot reject your own document.');
        }
        if (!reason?.trim()) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A rejection reason is required.', {
                reason: 'Give a reason.',
            });
        }

        doc.verification_status = 'rejected';
        doc.rejection_reason = reason.trim();
        doc.verified_by = actor.id;
        doc.verified_at = nowIso();
        doc.updated_at = nowIso();

        audit('kyc.document_rejected', doc.user_id, { reason: reason.trim() });
        return toApiDocument(doc, true);
    }

    async approve(userId: string): Promise<ApiKycSummary> {
        await delay(400);
        const actor = requireStaff();
        if (userId === actor.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot approve your own KYC.');

        const unverified = MANDATORY_KYC_DOC_TYPES.filter(
            (type) =>
                !db.documents.some(
                    (d) => d.user_id === userId && d.doc_type === type && d.verification_status === 'verified',
                ),
        );
        if (unverified.length > 0) {
            throw new ApiError(
                422,
                'BUSINESS_RULE_VIOLATION',
                `Every required document must be verified first. Outstanding: ${unverified.join(', ')}.`,
            );
        }
        if (db.documents.some((d) => d.user_id === userId && d.verification_status === 'verified' && isExpired(d.expiry_date))) {
            throw new ApiError(
                422,
                'BUSINESS_RULE_VIOLATION',
                'A verified document has expired. The rider must upload a current one.',
            );
        }

        audit('kyc.approved', userId, { kyc_status: 'verified' });
        return kycSummaryFor(userId, true);
    }

    async reject(userId: string, reason: string): Promise<ApiKycSummary> {
        await delay(400);
        const actor = requireStaff();
        if (userId === actor.id) throw new ApiError(403, 'FORBIDDEN', 'You cannot reject your own KYC.');
        if (!reason?.trim()) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A rejection reason is required.', {
                reason: 'Give a reason.',
            });
        }

        const open = db.documents.filter((d) => d.user_id === userId && d.verification_status === 'pending');
        if (open.length === 0 && computeKycStatus(userId) === 'rejected') {
            throw new ApiError(409, 'CONFLICT', "This rider's KYC is already rejected.");
        }

        for (const d of open) {
            d.verification_status = 'rejected';
            d.rejection_reason = reason.trim();
            d.verified_by = actor.id;
            d.verified_at = nowIso();
            d.updated_at = nowIso();
        }

        audit('kyc.rejected', userId, { reason: reason.trim() });
        return kycSummaryFor(userId, true);
    }

    /**
     * Stands in for a signed URL. Seeded rows carry a data-URI placeholder;
     * documents uploaded during the session return the real local file URI, so
     * previews show what you actually picked.
     */
    private urlFor(doc: MockDocumentRow, side: 'front' | 'back'): ApiSignedUrl {
        const uri = side === 'front' ? doc.front_uri : doc.back_uri;
        if (!uri) throw new ApiError(404, 'NOT_FOUND', `This document has no ${side} side.`);
        return { url: uri, expires_in: 300 };
    }
}

// ---------------------------------------------------------------------------
// Vehicle catalog
// ---------------------------------------------------------------------------

export class MockVehicleCatalogRepository implements VehicleCatalogRepository {
    async list(params: ListVehicleModelsParams): Promise<Paginated<ApiVehicleModel>> {
        await delay(250);

        let rows = SEED_VEHICLE_MODELS.slice();
        if (params.category) rows = rows.filter((m) => m.category === params.category);
        if (params.vendorId) rows = rows.filter((m) => m.vendor?.id === params.vendorId);
        if (params.search) {
            const q = params.search.trim().toLowerCase();
            rows = rows.filter((m) => m.name.toLowerCase().includes(q));
        }

        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;
        const total = rows.length;
        const start = (page - 1) * pageSize;

        return {
            data: rows.slice(start, start + pageSize),
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
        };
    }

    async featured(): Promise<ApiVehicleModel | null> {
        await delay(200);
        return SEED_VEHICLE_MODELS.find((m) => m.is_featured) ?? null;
    }

    async get(id: string): Promise<ApiVehicleModelDetail> {
        await delay(250);
        const model = SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === id);
        if (!model) throw new ApiError(404, 'NOT_FOUND', 'This scooter model could not be found.');
        return model;
    }
}

// ---------------------------------------------------------------------------
// Bookings (Phase 1 — no live payment)
// ---------------------------------------------------------------------------

function toApiBooking(row: MockBookingRow): ApiBooking {
    const model = SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === row.vehicle_model_id);
    const station = SEED_STATIONS.find((s) => s.id === row.station_id);
    const plan = model?.plans.find((p) => p.id === row.plan_id);

    return {
        id: row.id,
        status: row.status,
        start_day: row.start_day,
        created_at: row.created_at,
        vehicle_model: model ? { id: model.id, name: model.name } : null,
        station: station ? { id: station.id, name: station.name, code: station.code } : null,
        plan: plan ? { id: plan.id, name: plan.name, billing_cycle: plan.billing_cycle, price: plan.price } : null,
    };
}

export class MockBookingRepository implements BookingRepository {
    async create(payload: CreateBookingPayload): Promise<ApiBooking> {
        await delay(500);
        const actor = requireSession();

        if (computeKycStatus(actor.id) !== 'verified') {
            throw new ApiError(403, 'FORBIDDEN', 'Complete KYC verification before booking a scooter.');
        }
        if (!isValidStartDay(payload.start_day)) {
            throw new ApiError(
                422,
                'BUSINESS_RULE_VIOLATION',
                'Pick a day between Monday and Saturday, today or later.',
                { start_day: 'Pick a day between Monday and Saturday, today or later.' },
            );
        }

        const row: MockBookingRow = {
            id: uid('bk'),
            user_id: actor.id,
            vehicle_model_id: payload.vehicle_model_id,
            station_id: payload.station_id,
            plan_id: payload.plan_id,
            start_day: payload.start_day,
            status: 'pending_payment',
            created_at: nowIso(),
        };

        db.bookings.push(row);
        audit('booking.created', actor.id, { vehicle_model_id: row.vehicle_model_id, start_day: row.start_day });
        return toApiBooking(row);
    }

    async mine(): Promise<ApiBooking | null> {
        await delay(200);
        const actor = requireSession();
        const rows = db.bookings
            .filter((b) => b.user_id === actor.id && ACTIVE_BOOKING_STATUSES.includes(b.status))
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return rows.length > 0 ? toApiBooking(rows[0]) : null;
    }

    async nearestStation(_lat: number, _lng: number): Promise<ApiStation> {
        await delay(150);
        const station = SEED_STATIONS[0];
        if (!station) throw new ApiError(404, 'NOT_FOUND', 'No pickup station is available yet.');
        // Mock mode has a single seeded station — distance is a stand-in,
        // not a real haversine calculation (the real API computes this via
        // PostGIS; see stations.service.ts's nearest_station RPC).
        return { ...station, distance_km: 2.4 };
    }
}

/** Test hook: restores the seed so a demo can be re-run from a clean slate. */
export function resetMockDb(): void {
    db.users = SEED_USERS.map((u) => ({ ...u }));
    db.documents = SEED_DOCUMENTS.map((d) => ({ ...d }));
    db.audit = SEED_AUDIT.map((a) => ({ ...a }));
    db.bookings = [];
    db.currentUserId = null;
}

export { PLACEHOLDER_IMAGE };
export type { VerificationStatus };
