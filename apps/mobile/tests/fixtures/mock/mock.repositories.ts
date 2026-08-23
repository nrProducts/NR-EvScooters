import { ApiError } from '../../../src/lib/ApiError';
import { isValidStartDay } from '../../../src/lib/bookingDays';
import { computeCancellationCharge } from '../../../src/lib/cancellationPolicy';
import { planExpiryFor, returnDeadlineFor } from '../../../src/lib/returnPolicy';
import { MANDATORY_KYC_DOC_TYPES } from '../../../src/types/api';
import type {
    ApiAvailability, ApiBooking, ApiDocument, ApiKycSummary,
    ApiMaintenanceNotice, ApiMaintenanceRecord, ApiMe, ApiReferralSummary, ApiRental, ApiReturnSettlement, ApiSignedUrl,
    ApiStation, ApiSupportRequest, ApiUser, ApiUserDetail, ApiVehicleModel,
    ApiVehicleModelDetail, BookingRefundStatus, BookingStatus, CreateBookingPayload, CreateSupportRequestPayload,
    KycStatus, ListVehicleModelsParams, LocalFile, MaintenanceHistoryParams, Paginated,
    RentalStatus, ReturnRequestPayload, SupportPriority, SupportStatus,
    UpdateUserPayload, VerificationStatus,
} from '../../../src/types/api';
import type {
    AuthRepository, BookingRepository, KycRepository, MaintenanceRepository,
    NotificationRepository, ReferralRepository, RentalRepository, SessionRef,
    SupportRepository, UpdateDocumentInput, UploadDocumentInput,
    UploadPhotoResult, UserRepository, VehicleCatalogRepository,
} from '../../../src/services/types';
import type { ApiNotification } from '../../../src/types/api';
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
 * on reload. That is deliberate â€” a mock that persists is a mock you start
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
    cancelled_at?: string | null;
    cancellation_reason?: string | null;
    plan_price_at_cancellation?: number | null;
    cancellation_penalty_amount?: number | null;
    refund_amount?: number | null;
    refund_status?: BookingRefundStatus | null;
    refund_initiated_at?: string | null;
    refund_completed_at?: string | null;
    refund_transaction_id?: string | null;
}

interface MockRentalRow {
    id: string;
    user_id: string;
    vehicle_id: string;
    booking_id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    plan_id?: string | null;
    plan_duration_days?: number | null;
    plan_price_at_pickup?: number | null;
    expires_at?: string | null;
    return_requested_at?: string | null;
    return_reason?: string | null;
    return_feedback?: string | null;
    return_due_at?: string | null;
    days_late?: number | null;
    late_penalty_amount?: number | null;
    late_fee_per_day?: number | null;
}

/**
 * Mirrors the plans.duration_days backfill in
 * 20260804100000_plan_period_and_rental_expiry.sql. Mock mode's catalog plans
 * (ApiPlan) predate that column, so the mapping lives here rather than on the
 * seed rows.
 */
const PLAN_DURATION_DAYS: Record<string, number> = {
    daily: 1, weekly: 7, monthly: 30, yearly: 365,
};

interface MockRentalFeedbackRow {
    id: string;
    rental_id: string;
    user_id: string;
    rating: number;
    comment: string | null;
    created_at: string;
}

interface MockNotificationRow {
    id: string;
    user_id: string;
    template: string;
    payload: { title: string; body: string; screen?: string } | null;
    status: 'sent' | 'failed' | 'pending';
    read_at: string | null;
    created_at: string;
}

interface MockSupportRow {
    id: string;
    user_id: string;
    rental_id: string | null;
    vehicle_id: string | null;
    assigned_to: string | null;
    subject: string;
    description: string;
    status: SupportStatus;
    priority: SupportPriority;
    resolved_at: string | null;
    created_at: string;
}

const ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['pending_payment', 'confirmed'];

const db = {
    users: SEED_USERS.map((u) => ({ ...u })),
    documents: SEED_DOCUMENTS.map((d) => ({ ...d })),
    audit: SEED_AUDIT.map((a) => ({ ...a })),
    bookings: [] as MockBookingRow[],
    notifications: [] as MockNotificationRow[],
    rentals: [] as MockRentalRow[],
    rentalFeedback: [] as MockRentalFeedbackRow[],
    supportRequests: [] as MockSupportRow[],
    currentUserId: null as string | null,
    referrals: [] as { referee_id: string; referrer_id: string; code_used: string }[],
};

const REFERRAL_OFFER_AMOUNT = 100;

function mockReferralCodeFor(userId: string): string {
    // slice(-8), not slice(0, 8): the seed ids share a prefix, so taking the
    // FRONT collapsed every u-rider-00X to the same "URIDER00" code and made
    // any rider-to-rider redemption look like self-referral.
    return userId.replace(/[^A-Za-z0-9]/g, '').slice(-8).toUpperCase() || 'REFERME1';
}

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

/** Mirrors notifyUser on the backend, minus real push delivery â€” mock mode
 *  has no device token to send to, so every entry just lands as "sent". */
function notify(userId: string, input: { template: string; title: string; body: string; screen?: string }) {
    db.notifications.unshift({
        id: uid('n'),
        user_id: userId,
        template: input.template,
        payload: { title: input.title, body: input.body, screen: input.screen },
        status: 'sent',
        read_at: null,
        created_at: nowIso(),
    });
}

function requireSession(): MockUserRow {
    const user = db.users.find((u) => u.id === db.currentUserId);
    if (!user) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
    return user;
}

const isAdminRow = (u: MockUserRow) => u.role === 'admin';

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
        (d) => d.verification_status === 'verified' && !isExpired(d.expires_on),
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
                !isExpired(d.expires_on),
        ),
    ).length;
    return Math.round((verified / MANDATORY_KYC_DOC_TYPES.length) * 100);
}

// --- projections (row -> API shape) ----------------------------------------

function toApiUser(row: MockUserRow): ApiUser {
    const { ...rest } = row;
    return { ...rest, kyc_status: computeKycStatus(row.id) };
}

/**
 * `reveal` is gone from the real API: the full identity number is validated at
 * upload and never stored, so there is nothing to reveal. The mock keeps only
 * the masked tail to match.
 */
function toApiDocument(row: MockDocumentRow): ApiDocument {
    return {
        id: row.id,
        // The wire names changed with `kyc_documents`: `doc_type` is
        // `document_type` and `expires_on` is `expires_on`. The mock ROW
        // keeps its own field names — it stands in for the table, not the
        // response — so the rename happens here, in the projection, exactly
        // as it does in the real service.
        document_type: row.doc_type,
        doc_number_masked: maskDocNumber(row.doc_number),
        verification_status: row.verification_status,
        rejection_reason: row.rejection_reason,
        expires_on: row.expires_on,
        is_expired: isExpired(row.expires_on),
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
            document_type: d.doc_type,
            doc_number_masked: maskDocNumber(d.doc_number),
            verification_status: d.verification_status,
            rejection_reason: d.rejection_reason,
            expires_on: d.expires_on,
            submitted_at: d.submitted_at,
            verified_at: d.verified_at,
        })),
    };
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

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export class MockAuthRepository implements AuthRepository {
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
            // shouldCreateUser=true â€” a brand-new blank profile, which is what
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
                role: 'rider',
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

    async signOut(): Promise<void> {
        db.currentUserId = null;
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
            // phase) â€” an assigned scooter is the closest existing stand-in
            // for "has a live rental" so the post-booking dashboard demoes.
            has_active_rental: !!row.assigned_vehicle,
            has_active_booking: db.bookings.some(
                (b) => b.user_id === row.id && ACTIVE_BOOKING_STATUSES.includes(b.status),
            ),
            // The mock db has no consent_records table. Reporting "up to
            // date" keeps the mock's routing identical to today's, which is
            // what these fixtures are for — the real consent gate is covered
            // by the backend's consent.test.ts, not here.
            consent_up_to_date: true,
            consent_notice_version: '2026-08-14.1',
        };
    }

    /**
     * Inlined from the removed staff `update(id, patch)`, which this used to
     * delegate to. The cross-user 403 branch is gone by construction — a rider
     * can only ever edit themselves — but everything else is verbatim,
     * `profile_completed: true` included: the onboarding flow depends on it.
     */
    async updateMe(patch: UpdateUserPayload): Promise<ApiUserDetail> {
        await delay();
        const row = requireSession();

        assertEmailPhoneFree(patch.email, patch.phone, row.id);

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

        audit('user.updated', row.id, { fields: Object.keys(patch) });
        return toApiUserDetail(row);
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

    async registerPushToken(_token: string): Promise<void> {
        await delay(100);
        const row = requireSession();
        audit('user.push_token_registered', row.id);
    }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export class MockNotificationRepository implements NotificationRepository {
    async list(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiNotification>> {
        await delay(150);
        const row = requireSession();
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;

        const all = db.notifications.filter((n) => n.user_id === row.id);
        const start = (page - 1) * pageSize;
        const data = all.slice(start, start + pageSize).map(toApiNotification);

        return {
            data,
            pagination: {
                page, pageSize, total: all.length,
                totalPages: pageSize > 0 ? Math.ceil(all.length / pageSize) : 0,
            },
        };
    }

    async unreadCount(): Promise<number> {
        await delay(80);
        const row = requireSession();
        return db.notifications.filter((n) => n.user_id === row.id && !n.read_at).length;
    }

    async markRead(id: string): Promise<ApiNotification> {
        await delay(100);
        const row = requireSession();
        const notification = db.notifications.find((n) => n.id === id && n.user_id === row.id);
        if (!notification) throw new ApiError(404, 'NOT_FOUND', 'Notification not found.');
        notification.read_at = nowIso();
        return toApiNotification(notification);
    }

    async markAllRead(): Promise<void> {
        await delay(150);
        const row = requireSession();
        for (const n of db.notifications) {
            if (n.user_id === row.id && !n.read_at) n.read_at = nowIso();
        }
    }
}

function toApiNotification(row: MockNotificationRow): ApiNotification {
    return {
        id: row.id,
        template: row.template,
        payload: row.payload,
        status: row.status,
        read_at: row.read_at,
        created_at: row.created_at,
    };
}

// ---------------------------------------------------------------------------
// KYC
// ---------------------------------------------------------------------------

function findDocument(documentId: string): MockDocumentRow {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
    return doc;
}

function kycSummaryFor(userId: string): ApiKycSummary {
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
        documents: docs.map((d) => toApiDocument(d)),
    };
}

export class MockKycRepository implements KycRepository {
    async mine(): Promise<ApiKycSummary> {
        await delay(200);
        return kycSummaryFor(requireSession().id);
    }

    async uploadMine(input: UploadDocumentInput): Promise<ApiDocument> {
        // Longer, so the upload spinner is actually visible.
        await delay(700);
        const actor = requireSession();

        if (input.doc_type === 'driving_licence') {
            if (!input.expires_on) {
                throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'A driving licence must include its expiry date.', {
                    expires_on: 'Enter the licence expiry date.',
                });
            }
            if (isExpired(input.expires_on)) {
                throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This driving licence has already expired.', {
                    expires_on: 'This licence has expired.',
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
            expires_on: input.expires_on ?? null,
            submitted_at: null,
            created_at: nowIso(),
            updated_at: nowIso(),
        };

        db.documents.push(row);
        audit('kyc.document_uploaded', actor.id, { doc_type: row.doc_type });
        return toApiDocument(row);
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
        if (input.expires_on && doc.doc_type === 'driving_licence' && isExpired(input.expires_on)) {
            throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'This driving licence has already expired.', {
                expires_on: 'This licence has expired.',
            });
        }

        if (input.doc_number) doc.doc_number = input.doc_number.trim().toUpperCase();
        if (input.expires_on) doc.expires_on = input.expires_on;
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
        return toApiDocument(doc);
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
        return kycSummaryFor(actor.id);
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
    async availabilitySummary(): Promise<{ available_count: number }> {
        await delay(150);
        return { available_count: SEED_VEHICLE_MODELS.length * 3 };
    }

    async availability(id: string): Promise<ApiAvailability> {
        await delay(150);
        const model = SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === id);
        if (!model) throw new ApiError(404, 'NOT_FOUND', 'This scooter model could not be found.');
        // The seed fleet all sits at the single seeded station, so a station
        // filter can't change the answer here.
        return model.availability;
    }
}

// ---------------------------------------------------------------------------
// Bookings (Phase 1 â€” no live payment)
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
        // Mirrors the real API: a pending_payment booking is time-boxed,
        // so the mock must carry a deadline too or Home renders it as a
        // confirmed pickup in mock mode while behaving correctly live.
        hold_expires_at: row.status === 'pending_payment'
            ? new Date(new Date(row.created_at).getTime() + 30 * 60_000).toISOString()
            : null,
        vehicle_model: model ? { id: model.id, name: model.name } : null,
        station: station ? { id: station.id, name: station.name, code: station.code, lat: station.lat, lng: station.lng } : null,
        plan: plan
            ? {
                id: plan.id, name: plan.name, billing_cycle: plan.billing_cycle, price: plan.price,
                duration_days: plan.duration_days, deposit_amount: plan.deposit_amount,
            }
            : null,
        // Mock DB has no per-unit vehicle allocation concept â€” matches
        // production's pre-pickup reality when no unit has been reserved yet.
        vehicle: null,
        referral_discount_amount: null,
        cancelled_at: row.cancelled_at ?? null,
        cancellation_reason: row.cancellation_reason ?? null,
        plan_price_at_cancellation: row.plan_price_at_cancellation ?? null,
        cancellation_penalty_amount: row.cancellation_penalty_amount ?? null,
        refund_amount: row.refund_amount ?? null,
        refund_status: row.refund_status ?? null,
        refund_initiated_at: row.refund_initiated_at ?? null,
        refund_completed_at: row.refund_completed_at ?? null,
        refund_transaction_id: row.refund_transaction_id ?? null,
    };
}

function toApiRental(row: MockRentalRow): ApiRental {
    const booking = db.bookings.find((b) => b.id === row.booking_id);
    const model = booking ? SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === booking.vehicle_model_id) : undefined;
    const station = booking ? SEED_STATIONS.find((s) => s.id === booking.station_id) : undefined;
    const plan = booking ? model?.plans.find((p) => p.id === booking.plan_id) : undefined;

    return {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        booking_id: row.booking_id,
        // Mock mode has no per-unit fleet inventory wired to bookings —
        // stand in with the booked model's name.
        vehicle: model
            ? {
                id: row.vehicle_id,
                name: model.name,
                registration_number: 'MOCK-0001',
                battery_percentage: 87,
                // Mock DB has no fleet servicing schedule; null exercises the
                // same "hide the row" path a real unset date takes.
                next_service_due_date: null,
            }
            : null,
        station: station ? { id: station.id, name: station.name, code: station.code } : null,
        plan: plan ? { id: plan.id, name: plan.name, billing_cycle: plan.billing_cycle, price: plan.price } : null,
        plan_id: row.plan_id ?? null,
        plan_duration_days: row.plan_duration_days ?? null,
        plan_price_at_pickup: row.plan_price_at_pickup ?? null,
        expires_at: row.expires_at ?? null,
        // Mock mode doesn't simulate the recurring-billing engine — null
        // means the return-gate fails open, same as a real rental with no plan.
        plan_status: null,
        next_due_at: null,
        current_period_start: null,
        renewal_status: null,
        scheduled_start_date: null,
        return_requested_at: row.return_requested_at ?? null,
        return_reason: row.return_reason ?? null,
        return_feedback: row.return_feedback ?? null,
        return_due_at: row.return_due_at ?? null,
        days_late: row.days_late ?? null,
        late_penalty_amount: row.late_penalty_amount ?? null,
        late_fee_per_day: row.late_fee_per_day ?? null,
    };
}

export class MockBookingRepository implements BookingRepository {
    async create(payload: CreateBookingPayload): Promise<ApiBooking> {
        await delay(500);
        const actor = requireSession();

        if (computeKycStatus(actor.id) !== 'verified') {
            throw new ApiError(403, 'FORBIDDEN', 'Complete KYC verification before booking a scooter.');
        }
        const alreadyBooked = db.bookings.some(
            (b) => b.user_id === actor.id && ACTIVE_BOOKING_STATUSES.includes(b.status),
        );
        const alreadyRenting = db.rentals.some((r) => r.user_id === actor.id && r.status === 'active');
        if (alreadyBooked || alreadyRenting) {
            throw new ApiError(
                409,
                'CONFLICT',
                'You already have an active booking or rental. Return your scooter or wait for pickup before booking another.',
            );
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
            // No payment step exists yet, so a booking is immediately ready
            // for pickup â€” mirrors createBooking in the real backend.
            status: 'confirmed',
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

    async byId(bookingId: string): Promise<ApiBooking> {
        await delay(200);
        const actor = requireSession();
        const row = db.bookings.find((b) => b.id === bookingId && b.user_id === actor.id);
        if (!row) throw new ApiError(404, 'NOT_FOUND', 'Booking not found.');
        return toApiBooking(row);
    }

    /**
     * Mirrors cancelMyBooking on the backend, including the 404-not-403 choice
     * for another rider's booking. No vehicle bookkeeping â€” mock mode has no
     * per-unit allocation (see toApiBooking).
     */
    async cancel(bookingId: string, reason?: string): Promise<ApiBooking> {
        await delay(400);
        const actor = requireSession();

        const row = db.bookings.find((b) => b.id === bookingId);
        if (!row || row.user_id !== actor.id) {
            throw new ApiError(404, 'NOT_FOUND', 'Booking not found.');
        }
        if (row.status === 'fulfilled') {
            throw new ApiError(409, 'CONFLICT', "This booking has already been picked up and can't be cancelled here.");
        }
        if (row.status === 'cancelled') {
            throw new ApiError(409, 'CONFLICT', 'This booking is already cancelled.');
        }
        if (row.status === 'expired') {
            throw new ApiError(409, 'CONFLICT', "This booking has expired and can't be cancelled.");
        }
        if (!ACTIVE_BOOKING_STATUSES.includes(row.status)) {
            throw new ApiError(409, 'CONFLICT', 'This booking can no longer be cancelled.');
        }

        const model = SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === row.vehicle_model_id);
        const plan = model?.plans.find((p) => p.id === row.plan_id);
        // Mock bookings go straight to 'confirmed' on create (no payment
        // step — see create() above), so they're always "paid" here.
        const charge = computeCancellationCharge({
            startDay: row.start_day,
            planPrice: plan?.price ?? null,
            depositAmount: plan?.deposit_amount ?? 0,
            createdAt: row.created_at,
        });

        row.status = 'cancelled';
        row.cancelled_at = nowIso();
        row.cancellation_reason = reason ?? null;
        row.plan_price_at_cancellation = charge.chargeableAmount;
        row.cancellation_penalty_amount = charge.penaltyAmount;
        row.refund_amount = charge.refundAmount;
        // No real gateway in mock mode — a refund "completes" instantly,
        // mirroring the backend's own no-keys-configured mock-refund path.
        if (charge.refundAmount > 0) {
            row.refund_status = 'processed';
            row.refund_initiated_at = nowIso();
            row.refund_completed_at = nowIso();
            row.refund_transaction_id = uid('mock_refund');
        } else {
            row.refund_status = 'not_required';
        }

        audit('booking.cancelled', actor.id, {
            status: 'cancelled',
            penalty_amount: charge.penaltyAmount,
            refund_amount: charge.refundAmount,
        });

        return toApiBooking(row);
    }

    async history(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiBooking>> {
        await delay(200);
        const actor = requireSession();
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;

        const rows = db.bookings
            .filter((b) => b.user_id === actor.id)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        const start = (page - 1) * pageSize;
        const data = rows.slice(start, start + pageSize).map(toApiBooking);
        return {
            data,
            pagination: { page, pageSize, total: rows.length, totalPages: pageSize > 0 ? Math.ceil(rows.length / pageSize) : 0 },
        };
    }

    async nearestStation(_lat: number, _lng: number): Promise<ApiStation> {
        await delay(150);
        const station = SEED_STATIONS[0];
        if (!station) throw new ApiError(404, 'NOT_FOUND', 'No pickup station is available yet.');
        // Mock mode has a single seeded station â€” distance is a stand-in,
        // not a real haversine calculation (the real API computes this via
        // PostGIS; see stations.service.ts's nearest_station RPC).
        return { ...station, distance_km: 2.4 };
    }

}

export class MockRentalRepository implements RentalRepository {
    async mine(): Promise<ApiRental | null> {
        await delay(200);
        const actor = requireSession();
        const row = db.rentals.find((r) => r.user_id === actor.id && r.status === 'active');
        return row ? toApiRental(row) : null;
    }

    async history(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiRental>> {
        await delay(200);
        const actor = requireSession();
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;

        const rows = db.rentals
            .filter((r) => r.user_id === actor.id)
            .sort((a, b) => (a.started_at < b.started_at ? 1 : -1));

        const start = (page - 1) * pageSize;
        const data = rows.slice(start, start + pageSize).map(toApiRental);
        return {
            data,
            pagination: { page, pageSize, total: rows.length, totalPages: pageSize > 0 ? Math.ceil(rows.length / pageSize) : 0 },
        };
    }

    /**
     * Mirrors requestReturn on the backend, including the 404-not-403 choice
     * for another rider's rental.
     *
     * âš ï¸ Deliberately does NOT clear the user's assigned_vehicle. me() derives
     * has_active_rental from `!!row.assigned_vehicle`, and the rider still
     * physically holds the scooter until staff confirm the handover â€” so the
     * flag must stay true. Clearing it here is the natural instinct when
     * writing a "return" method and would be wrong.
     */
    async requestReturn(rentalId: string, payload: ReturnRequestPayload): Promise<ApiRental> {
        await delay(400);
        const actor = requireSession();

        const row = db.rentals.find((r) => r.id === rentalId);
        if (!row || row.user_id !== actor.id) {
            throw new ApiError(404, 'NOT_FOUND', 'Rental not found.');
        }
        if (row.status !== 'active') {
            throw new ApiError(409, 'CONFLICT', 'This rental is no longer active.');
        }
        if (row.return_requested_at) {
            throw new ApiError(409, 'CONFLICT', "You've already requested a return for this scooter.");
        }

        const now = new Date();
        row.return_requested_at = now.toISOString();
        row.return_reason = payload.reason;
        row.return_feedback = payload.feedback ?? null;
        // Clamped to the plan's expiry, same as the backend: a rider already
        // past expires_at must not get their overrun wiped by requesting a
        // return with a deadline of today.
        const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
        const requestDeadline = returnDeadlineFor(now);
        row.return_due_at = (expiresAt && expiresAt < requestDeadline ? expiresAt : requestDeadline).toISOString();
        // status stays 'active' â€” see the doc comment above.

        const existingFeedback = db.rentalFeedback.find((f) => f.rental_id === rentalId);
        if (existingFeedback) {
            existingFeedback.rating = payload.rating;
            existingFeedback.comment = payload.feedback ?? null;
        } else {
            db.rentalFeedback.push({
                id: uid('rf'),
                rental_id: rentalId,
                user_id: actor.id,
                rating: payload.rating,
                comment: payload.feedback ?? null,
                created_at: nowIso(),
            });
        }

        notify(actor.id, {
            template: 'rental_return_requested',
            title: 'Return Requested',
            body: 'Hand your scooter in by 11:59 PM today. Our team will confirm the handover.',
            screen: 'post-booking-dashboard',
        });
        audit('rental.return_requested', actor.id, { return_reason: payload.reason, rating: payload.rating });

        return toApiRental(row);
    }

    // Mock mode doesn't simulate the return-settlement flow — no return in
    // this fixture set is ever approved with a computed settlement.
    async settlement(): Promise<ApiReturnSettlement | null> {
        await delay(100);
        return null;
    }
}

function toApiSupportRequest(row: MockSupportRow): ApiSupportRequest {
    return {
        id: row.id,
        subject: row.subject,
        description: row.description,
        status: row.status,
        priority: row.priority,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
    };
}

export class MockSupportRepository implements SupportRepository {
    async create(payload: CreateSupportRequestPayload): Promise<ApiSupportRequest> {
        await delay(400);
        const actor = requireSession();

        const activeRental = db.rentals.find((r) => r.user_id === actor.id && r.status === 'active');

        const row: MockSupportRow = {
            id: uid('sr'),
            user_id: actor.id,
            rental_id: activeRental?.id ?? null,
            vehicle_id: activeRental?.vehicle_id ?? null,
            assigned_to: null,
            subject: payload.subject,
            description: payload.description,
            status: 'open',
            priority: 'medium',
            resolved_at: null,
            created_at: nowIso(),
        };

        db.supportRequests.push(row);
        audit('support.created', actor.id, { subject: row.subject });
        return toApiSupportRequest(row);
    }

    async mine(params: { page?: number; pageSize?: number }): Promise<Paginated<ApiSupportRequest>> {
        await delay(200);
        const actor = requireSession();
        const page = params.page ?? 1;
        const pageSize = params.pageSize ?? 20;

        const rows = db.supportRequests
            .filter((r) => r.user_id === actor.id)
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

        const start = (page - 1) * pageSize;
        const data = rows.slice(start, start + pageSize).map(toApiSupportRequest);
        return {
            data,
            pagination: { page, pageSize, total: rows.length, totalPages: pageSize > 0 ? Math.ceil(rows.length / pageSize) : 0 },
        };
    }

}

export class MockReferralRepository implements ReferralRepository {
    async mine(): Promise<ApiReferralSummary> {
        await delay(150);
        const user = requireSession();
        const referred = db.referrals.filter((r) => r.referrer_id === user.id);
        return {
            referral_code: mockReferralCodeFor(user.id),
            referred_count: referred.length,
            qualified_count: referred.length,
            offer_amount: REFERRAL_OFFER_AMOUNT,
            rewards: [],
        };
    }

    async redeem(code: string): Promise<void> {
        await delay(150);
        const user = requireSession();

        if (db.referrals.some((r) => r.referee_id === user.id)) {
            throw new ApiError(409, 'CONFLICT', "You've already used a referral code.");
        }

        const referrer = db.users.find((u) => mockReferralCodeFor(u.id) === code.toUpperCase());
        if (!referrer) throw new ApiError(404, 'NOT_FOUND', 'Invalid referral code.');
        if (referrer.id === user.id) throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', "You can't refer yourself.");

        db.referrals.push({ referee_id: user.id, referrer_id: referrer.id, code_used: code.toUpperCase() });
    }
}

export class MockMaintenanceRepository implements MaintenanceRepository {
    /**
     * Mock DB has no vehicle_maintenance concept â€” matches production's
     * early-days reality anyway. Params are accepted and ignored: there is
     * nothing to filter, so mock mode always shows the empty state.
     */
    async history(params?: MaintenanceHistoryParams): Promise<Paginated<ApiMaintenanceRecord>> {
        await delay(150);
        requireSession();
        const pageSize = params?.pageSize ?? 20;
        return { data: [], pagination: { page: params?.page ?? 1, pageSize, total: 0, totalPages: 0 } };
    }
    async notice(): Promise<ApiMaintenanceNotice | null> {
        await delay(150);
        requireSession();
        return null;
    }
}

// -------------------------------------------------------------------------
// Test hooks
//
// Module-level functions, deliberately NOT repository methods. The app is
// rider-only (the admin console is apps/web), so the repositories expose no
// staff surface — but tests still need to open a session, start a rental and
// inspect derived state. These give them that without reintroducing an admin
// API that nothing in src/ would call.
// -------------------------------------------------------------------------

/**
 * Opens a session as the given seeded account. Was MockAuthRepository.signIn,
 * which every test file used to establish a session; the real app signs in
 * with phone + OTP or Google, so email/password no longer belongs on the
 * repository. Guards are unchanged, so the tests covering them still bite.
 */
export async function signInAs(email: string): Promise<SessionRef> {
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

/**
 * Moves a confirmed booking to an active rental — what staff pickup used to do
 * on the counter, and what several rider tests need as *setup* before they can
 * exercise returns or support-ticket auto-attach.
 *
 * Throws a plain Error, not ApiError: a broken fixture is a broken test, and
 * dressing it as a 404 would let a setup bug masquerade as the behaviour under
 * test.
 */
export function startMockRental(bookingId: string, vehicleId = 'mock-vehicle-1'): string {
    const booking = db.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error(`startMockRental: no booking ${bookingId}`);
    if (booking.status !== 'confirmed') {
        throw new Error(`startMockRental: booking ${bookingId} is ${booking.status}, expected confirmed`);
    }

    booking.status = 'fulfilled';
    const rentalId = uid('rt');
    // Mirrors confirmPickup: the plan is FROZEN onto the rental here, so
    // expires_at exists from the moment the rental does.
    const model = SEED_VEHICLE_MODELS_DETAIL.find((m) => m.id === booking.vehicle_model_id);
    const plan = model?.plans.find((p) => p.id === booking.plan_id);
    const durationDays = plan ? PLAN_DURATION_DAYS[plan.billing_cycle] : null;
    const startedAt = new Date();

    db.rentals.push({
        id: rentalId,
        user_id: booking.user_id,
        vehicle_id: vehicleId,
        booking_id: booking.id,
        status: 'active',
        started_at: startedAt.toISOString(),
        ended_at: null,
        plan_id: plan?.id ?? null,
        plan_duration_days: durationDays,
        plan_price_at_pickup: plan?.price ?? null,
        expires_at: durationDays ? planExpiryFor(startedAt, durationDays).toISOString() : null,
    });
    return rentalId;
}

/**
 * Marks a document rejected, as a reviewer would from the web console.
 *
 * Needed as setup for the rider-side "correct a rejected document" path: the
 * only seeded rejection belongs to u-rider-004, who is suspended and therefore
 * cannot sign in to correct anything.
 */
export function rejectMockDocument(documentId: string, reason: string): void {
    const doc = db.documents.find((d) => d.id === documentId);
    if (!doc) throw new Error(`rejectMockDocument: no document ${documentId}`);
    doc.verification_status = 'rejected';
    doc.rejection_reason = reason;
    doc.verified_by = 'u-staff-001';
    doc.verified_at = nowIso();
    doc.updated_at = nowIso();
}

/**
 * The KYC status/completion the fixture derives for a user, without needing a
 * session. Used to be read through the staff detail endpoint, which made the
 * derivation tests dependent on a staff login — and unusable for suspended
 * riders, who cannot sign in at all.
 */
export function mockKycDerivation(userId: string): { kyc_status: KycStatus; completion_percent: number } {
    return { kyc_status: computeKycStatus(userId), completion_percent: completionPercent(userId) };
}

/**
 * The rental/vehicle a support request was auto-attached to. Previously read
 * via the staff support detail projection; reading the row directly is more
 * precise about what the rider-side create() is actually being tested for.
 */
export function mockSupportContext(id: string): { rental_id: string | null; vehicle_id: string | null } {
    const row = db.supportRequests.find((r) => r.id === id);
    if (!row) throw new Error(`mockSupportContext: no support request ${id}`);
    return { rental_id: row.rental_id ?? null, vehicle_id: row.vehicle_id ?? null };
}

/**
 * Test hook: ages a booking so the post-creation grace period can be stepped
 * over. A mock booking is always created "now", which would otherwise make the
 * late-cancellation path unreachable from tests.
 */
export function backdateBookingCreatedAt(bookingId: string, createdAt: string): void {
    const row = db.bookings.find((b) => b.id === bookingId);
    if (row) row.created_at = createdAt;
}

/** Test hook: restores the seed so a demo can be re-run from a clean slate. */
export function resetMockDb(): void {
    db.users = SEED_USERS.map((u) => ({ ...u }));
    db.documents = SEED_DOCUMENTS.map((d) => ({ ...d }));
    db.audit = SEED_AUDIT.map((a) => ({ ...a }));
    db.bookings = [];
    db.rentals = [];
    db.supportRequests = [];
    db.referrals = [];
    db.currentUserId = null;
}

export { PLACEHOLDER_IMAGE };
export type { VerificationStatus };
