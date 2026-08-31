import type { Request } from "express";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { maskLast4 } from "../../common/mask";
import {
    AuthContext, MANDATORY_KYC_DOC_TYPES, Paginated, STAFF_ROLES, UserRole,
    UserStatus, isStaffRole,
} from "../../types";
import { ListUsersFilters, UserDetail, UserListItem, UserProfile } from "./users.types";
import { normaliseEmail, normalisePhone } from "./users.validation";
import { applyPermissionProfile } from "./staff-permissions.service";
import {
    assertValidPhoto, buildPhotoPath, createSignedPhotoUrl, photoPathBelongsToUser,
    removePhotoFile, uploadPhotoFile,
} from "./users.photo.storage";
import type { UploadedFile } from "../kyc/kyc.storage";
import { businessToday } from "../../common/dates";

/**
 * A user is five tables now.
 *
 * `users` keeps identity and account state; the address moved to
 * `user_addresses`, the emergency contact to `user_related_persons`, the
 * rider's KYC state to `rider_profiles`, the staff code and
 * must-change-password flag to `staff_profiles`, and the push token to
 * `user_devices`.
 *
 * PostgREST embeds all of them in one request, so the read path is still one
 * round trip. The write path is not: there is no multi-table upsert, so
 * createUser/updateUser fan out and then compensate on failure — see the
 * try/catch in createUser().
 *
 * The child embeds need no `!fkey` disambiguator, unlike the old
 * `user_roles`/`user_capabilities` ones: each has exactly one foreign key back
 * to `users`, because `granted_by` no longer lives on them.
 */
const PROFILE_SELECT = `
    id, full_name, email, phone, date_of_birth, gender, role, status,
    photo_storage_path, created_at, updated_at, deleted_at,
    rider_profiles(kyc_status, onboarding_completed_at),
    staff_profiles(staff_code, must_change_password, joined_on),
    user_addresses(line_1, line_2, city, state, postal_code, country, is_primary),
    user_related_persons(person_role, full_name, phone)
`;

/** The embedded shape `PROFILE_SELECT` returns, before flattening. */
interface RawUserRow {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    role: UserRole;
    status: UserStatus;
    photo_storage_path: string | null;
    created_at: string;
    updated_at: string | null;
    deleted_at: string | null;
    rider_profiles: unknown;
    staff_profiles: unknown;
    user_addresses: unknown;
    user_related_persons: unknown;
}

/** PostgREST gives a 1:1 embed as an object or a one-element array. */
function one<T>(value: unknown): T | null {
    if (!value) return null;
    return (Array.isArray(value) ? (value[0] ?? null) : value) as T | null;
}

function many<T>(value: unknown): T[] {
    if (!value) return [];
    return (Array.isArray(value) ? value : [value]) as T[];
}

/**
 * Collapses the five tables back into the flat shape both apps already read.
 *
 * The address chosen is the one flagged `is_primary`, falling back to whatever
 * exists — a user with only a billing address should still see it rather than
 * a blank form.
 */
function toProfile(row: RawUserRow): UserProfile {
    const rider = one<{ kyc_status: UserProfile["kyc_status"]; onboarding_completed_at: string | null }>(
        row.rider_profiles,
    );
    const staff = one<{ staff_code: string | null; must_change_password: boolean; joined_on: string | null }>(
        row.staff_profiles,
    );

    const addresses = many<{
        line_1: string; line_2: string | null; city: string; state: string;
        postal_code: string; country: string; is_primary: boolean;
    }>(row.user_addresses);
    const address = addresses.find((a) => a.is_primary) ?? addresses[0] ?? null;

    const emergency = many<{ person_role: string; full_name: string; phone: string | null }>(
        row.user_related_persons,
    ).find((p) => p.person_role === "emergency_contact") ?? null;

    return {
        id: row.id,
        full_name: row.full_name,
        email: row.email,
        phone: row.phone,
        date_of_birth: row.date_of_birth,
        gender: row.gender,
        address_line_1: address?.line_1 ?? null,
        address_line_2: address?.line_2 ?? null,
        city: address?.city ?? null,
        state: address?.state ?? null,
        postal_code: address?.postal_code ?? null,
        country: address?.country ?? null,
        emergency_contact_name: emergency?.full_name ?? null,
        emergency_contact_phone: emergency?.phone ?? null,
        account_status: row.status,
        kyc_status: rider?.kyc_status ?? "not_submitted",
        profile_photo_url: row.photo_storage_path,
        profile_completed: !!rider?.onboarding_completed_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at,
        staff_code: staff?.staff_code ?? null,
        must_change_password: staff?.must_change_password ?? false,
        joined_on: staff?.joined_on ?? null,
    };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listUsers(
    filters: ListUsersFilters,
    actor: AuthContext,
): Promise<Paginated<UserListItem>> {
    // includeDeleted is admin-only; staff silently never see deleted rows.
    const includeDeleted = filters.includeDeleted && actor.role === "admin";

    // kyc_status lives on the child table now, so filtering by it means
    // filtering the embed. `!inner` is what makes the embed restrict the
    // parent rather than just null it out — without it every staff account
    // (which has no rider profile) would come back too. The select string is
    // chosen up front rather than the query being rebuilt mid-function, so
    // there is only ever one builder and one inferred row type.
    const select = filters.kycStatus
        ? PROFILE_SELECT.replace("rider_profiles(", "rider_profiles!inner(")
        : PROFILE_SELECT;

    let query = supabaseAdmin.from("users").select(select, { count: "exact" });

    if (!includeDeleted) query = query.is("deleted_at", null);
    if (filters.accountStatus) query = query.eq("status", filters.accountStatus);
    if (filters.kycStatus) query = query.eq("rider_profiles.kyc_status", filters.kycStatus);

    if (filters.search) {
        const term = escapeLike(filters.search);
        // Name, email and phone only.
        //
        // Search by document number was REMOVED with the identity-number
        // minimisation, and stays removed even though the new schema keeps
        // the number encrypted: a blind-index lookup only matches the WHOLE
        // number, so it is not a search box, and the last-4 column would
        // return every rider sharing those digits — a disclosure to whoever
        // typed it. Ops searches by name and phone in practice.
        query = query.or([
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
        ].join(","));
    }

    // Role is a plain column now — no id lookup, no `in` list, no second query.
    if (filters.role) query = query.eq("role", filters.role);
    else if (filters.staffOnly) query = query.in("role", [...STAFF_ROLES]);

    const [from, to] = toRange(filters);
    // Sorting by kyc_status has to name the embedded table; the other two
    // are ordinary columns on `users`.
    const sortColumn = filters.sortBy === "kyc_status" ? "rider_profiles(kyc_status)" : filters.sortBy;
    query = query.order(sortColumn, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawUserRow[];
    const userIds = rows.map((r) => r.id);
    const [vehicles, plans, outstanding] = await Promise.all([
        activeVehicleByUser(userIds),
        currentPlanByUser(userIds),
        outstandingByUser(userIds),
    ]);

    const items: UserListItem[] = rows.map((row) => {
        const planInfo = plans.get(row.id);
        return {
            ...toProfile(row),
            role: row.role,
            assigned_vehicle: vehicles.get(row.id) ?? null,
            current_plan: planInfo?.plan ?? null,
            payment_status: planInfo?.payment_status ?? null,
            plan_started_at: planInfo?.plan_started_at ?? null,
            next_due_at: planInfo?.next_due_at ?? null,
            outstanding_amount: outstanding.get(row.id) ?? 0,
        };
    });

    return paginate(items, count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getUserById(id: string, actor: AuthContext): Promise<UserDetail> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select(PROFILE_SELECT)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("User not found.");

    const row = data as unknown as RawUserRow;

    // Deleted profiles are visible to admins only.
    if (row.deleted_at && actor.role !== "admin") throw notFound("User not found.");

    const [vehicles, plans, documents, lastLoginAt, outstanding] = await Promise.all([
        activeVehicleByUser([id]),
        currentPlanByUser([id]),
        documentsForUser(id),
        lastLoginFor(id),
        outstandingByUser([id]),
    ]);
    const planInfo = plans.get(id);

    return {
        ...toProfile(row),
        role: row.role,
        assigned_vehicle: vehicles.get(id) ?? null,
        current_plan: planInfo?.plan ?? null,
        payment_status: planInfo?.payment_status ?? null,
        plan_started_at: planInfo?.plan_started_at ?? null,
        next_due_at: planInfo?.next_due_at ?? null,
        outstanding_amount: outstanding.get(id) ?? 0,
        last_login_at: lastLoginAt,
        kyc_completion_percent: kycCompletionPercent(documents),
        // Storage paths are never included — see §2 "Do not expose confidential
        // storage paths". Bytes are reached only via POST /kyc signed-url flows.
        // The one place the column names become the wire names.
        documents: documents.map((d) => ({
            id: d.id,
            doc_type: d.document_type,
            doc_number_masked: maskLast4(d.document_number_last4),
            verification_status: d.verification_status,
            rejection_reason: d.rejection_reason,
            expires_on: d.expires_on,
            submitted_at: d.submitted_at,
            verified_at: d.verified_at,
        })),
    };
}

/**
 * Percentage of mandatory documents in a verified, unexpired state.
 * Mirrors public.compute_kyc_status() — keep both in step.
 */
export function kycCompletionPercent(
    docs: Array<{ document_type: string; verification_status: string; expires_on: string | null }>,
): number {
    const today = businessToday();
    const verified = MANDATORY_KYC_DOC_TYPES.filter((type) =>
        docs.some(
            (d) =>
                d.document_type === type &&
                d.verification_status === "verified" &&
                (!d.expires_on || d.expires_on >= today),
        ),
    ).length;
    return Math.round((verified / MANDATORY_KYC_DOC_TYPES.length) * 100);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export interface CreateUserInput {
    full_name: string;
    email: string;
    phone: string;
    date_of_birth?: string;
    gender?: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
    emergency_contact_name?: string;
    emergency_contact_phone?: string;
    role: UserRole;
    account_status: UserStatus;
    staff_code?: string;
    /** A `permission_profiles.code` — validated against the table, not a union. */
    permission_profile?: string;
}

const TEMP_PASSWORD_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const TEMP_PASSWORD_LOWER = "abcdefghjkmnpqrstuvwxyz";
const TEMP_PASSWORD_DIGITS = "23456789";
const TEMP_PASSWORD_ALL = TEMP_PASSWORD_UPPER + TEMP_PASSWORD_LOWER + TEMP_PASSWORD_DIGITS;
const TEMP_PASSWORD_LENGTH = 12;

/**
 * One-time password for an admin-created staff/admin account (see createUser
 * below). Excludes visually-ambiguous characters (0/O, 1/l/I) since it's read
 * off a screen and retyped by hand on first login. Guarantees at least one
 * upper/lower/digit rather than leaving the mix to chance, then shuffles with
 * the same CSPRNG used to pick each character.
 */
function generateTempPassword(): string {
    const pick = (chars: string) => chars[randomInt(chars.length)];
    const chars = [pick(TEMP_PASSWORD_UPPER), pick(TEMP_PASSWORD_LOWER), pick(TEMP_PASSWORD_DIGITS)];
    for (let i = chars.length; i < TEMP_PASSWORD_LENGTH; i++) {
        chars.push(pick(TEMP_PASSWORD_ALL));
    }
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join("");
}

/**
 * Creates the Auth user, then the profile and its child rows.
 *
 * Supabase gives us no cross-service transaction, so this uses a compensating
 * action: if any step after Auth creation fails, the Auth user is deleted
 * again and the original error surfaces. Deleting the auth user cascades to
 * `public.users` and from there to every child row, so one compensating call
 * still covers the whole fan-out.
 *
 * `handle_new_auth_user` creates the bare `users` row AND the matching
 * profile row for the role — a `rider_profiles` row by default. Migration 30
 * fixed the case this used to miss: a staff or admin account now gets a
 * `staff_profiles` row instead. That is why the role goes in the update below
 * rather than being set afterwards: a deferred constraint trigger checks that
 * the role and the profile agree at commit.
 *
 * Riders self-provision via mobile phone-OTP, so this admin path is a rare
 * edge case for them and keeps the original email-invite-link flow. Staff and
 * admin accounts have no mobile app to complete an invite link from, so they
 * get a temporary password instead, returned once as `temporary_password` for
 * the caller to reveal to the admin — never stored, never returned again.
 */
export async function createUser(
    input: CreateUserInput,
    actor: AuthContext,
    req?: Request,
): Promise<UserDetail & { temporary_password?: string }> {
    const email = normaliseEmail(input.email);
    const phone = normalisePhone(input.phone);

    await assertEmailAndPhoneFree(email, phone);

    // Only an admin may mint a non-rider account.
    if (input.role !== "rider" && actor.role !== "admin") {
        throw forbidden("Only an administrator may create staff or admin accounts.");
    }

    const isStaffAccount = input.role !== "rider";
    const temporaryPassword = isStaffAccount ? generateTempPassword() : undefined;

    const { data: created, error: authError } = isStaffAccount
        ? await supabaseAdmin.auth.admin.createUser({
            email,
            phone,
            password: temporaryPassword,
            email_confirm: true,
            phone_confirm: true,
            // The access-token hook and handle_new_auth_user both read this,
            // so the profile row is created with the right shape first time
            // rather than being corrected a moment later.
            user_metadata: { full_name: input.full_name, role: input.role },
        })
        : await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { full_name: input.full_name, role: "rider" },
            ...(env.inviteRedirectUrl ? { redirectTo: env.inviteRedirectUrl } : {}),
        });

    if (authError || !created?.user) {
        if (isDuplicateAuthUser(authError)) {
            throw conflict("This email is already registered.", {
                email: "This email is already registered.",
            });
        }
        throw authError ?? new Error("Auth user creation returned no user");
    }

    const authUserId = created.user.id;

    try {
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .update({
                full_name: input.full_name,
                email,
                phone,
                date_of_birth: input.date_of_birth ?? null,
                gender: input.gender ?? null,
                role: input.role,
                status: input.account_status,
            })
            .eq("id", authUserId)
            .select("id")
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Profile row was not provisioned for the new auth user");

        await writeAddress(authUserId, input);
        await writeEmergencyContact(
            authUserId,
            input.emergency_contact_name,
            input.emergency_contact_phone,
        );
        await ensureRoleProfile(authUserId, input.role, {
            staffCode: input.staff_code,
            mustChangePassword: isStaffAccount,
            // An admin-created account arrives with a full profile already —
            // it should never be routed through first-login onboarding.
            onboardingCompleted: true,
        });

        // Applied after the role is set so replaceModulePermissions can see
        // it. Inside the same try/catch as everything above: if this throws,
        // the compensating deleteUser() still fires, so a profile-apply
        // failure never leaves a half-provisioned staff account behind.
        if (input.permission_profile && isStaffRole(input.role)) {
            await applyPermissionProfile(authUserId, input.permission_profile, actor, req);
        }

        await writeAudit({
            actorId: actor.id,
            targetUserId: authUserId,
            action: "user.created",
            entityType: "user",
            entityId: authUserId,
            after: {
                email, phone, role: input.role, account_status: input.account_status,
                staff_code: input.staff_code ?? null,
                permission_profile: input.permission_profile ?? null,
            },
            req,
        });

        const detail = await getUserById(authUserId, actor);
        return temporaryPassword ? { ...detail, temporary_password: temporaryPassword } : detail;
    } catch (err) {
        // Compensating action: never leave an orphan Auth user behind.
        const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (cleanupError) {
            console.error("[users.create] orphaned auth user — manual cleanup required", {
                authUserId,
                cleanupError: cleanupError.message,
            });
        }
        throw err;
    }
}

export interface SelfSignUpInput {
    full_name: string;
    email: string;
    phone: string;
    password: string;
}

/**
 * Public counterpart to createUser() — no actor, no admin gate, called from
 * an unauthenticated POST /auth/signup. Always lands as `staff` with zero
 * permissions (resolveAccess blocks everything without an explicit grant) and
 * `status: "inactive"`, so an admin must deliberately activate the account
 * before it can even log in (see the staff-role + inactive check in
 * auth.middleware.ts's requireAuth). The caller chooses their own password,
 * so there's no temp password and no forced must_change_password — unlike
 * admin-created staff accounts.
 */
export async function selfSignUpStaff(
    input: SelfSignUpInput,
    req?: Request,
): Promise<{ full_name: string; email: string }> {
    const email = normaliseEmail(input.email);
    const phone = normalisePhone(input.phone);

    await assertEmailAndPhoneFree(email, phone);

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        phone,
        password: input.password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { full_name: input.full_name, role: "staff" },
    });

    if (authError || !created?.user) {
        if (isDuplicateAuthUser(authError)) {
            throw conflict("This email is already registered.", {
                email: "This email is already registered.",
            });
        }
        throw authError ?? new Error("Auth user creation returned no user");
    }

    const authUserId = created.user.id;

    try {
        const { data: profile, error: profileError } = await supabaseAdmin
            .from("users")
            .update({
                full_name: input.full_name,
                email,
                phone,
                role: "staff",
                status: "inactive",
                status_reason: "Self-registered — awaiting admin approval",
                status_changed_at: new Date().toISOString(),
            })
            .eq("id", authUserId)
            .select("id")
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Profile row was not provisioned for the new auth user");

        await ensureRoleProfile(authUserId, "staff", {
            mustChangePassword: false,
            onboardingCompleted: true,
        });

        await writeAudit({
            actorId: authUserId,
            targetUserId: authUserId,
            action: "user.self_signed_up",
            entityType: "user",
            entityId: authUserId,
            after: { email, phone, role: "staff", account_status: "inactive" },
            req,
        });

        return { full_name: input.full_name, email };
    } catch (err) {
        const { error: cleanupError } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
        if (cleanupError) {
            console.error("[users.selfSignUp] orphaned auth user — manual cleanup required", {
                authUserId,
                cleanupError: cleanupError.message,
            });
        }
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

/** Fields the flat patch can carry that no longer live on `users`. */
const ADDRESS_FIELDS = [
    "address_line_1", "address_line_2", "city", "state", "postal_code", "country",
] as const;
const CONTACT_FIELDS = ["emergency_contact_name", "emergency_contact_phone"] as const;

export async function updateUser(
    id: string,
    patch: Record<string, unknown>,
    actor: AuthContext,
    req?: Request,
): Promise<UserDetail> {
    const before = await requireLiveUser(id);

    const incoming: Record<string, unknown> = { ...patch };
    if (typeof incoming.email === "string") incoming.email = normaliseEmail(incoming.email);
    if (typeof incoming.phone === "string") incoming.phone = normalisePhone(incoming.phone);
    if (typeof incoming.emergency_contact_phone === "string") {
        incoming.emergency_contact_phone = normalisePhone(incoming.emergency_contact_phone);
    }

    await assertEmailAndPhoneFree(
        typeof incoming.email === "string" ? incoming.email : undefined,
        typeof incoming.phone === "string" ? incoming.phone : undefined,
        id,
    );

    // Changing the login email means changing it in Auth too, or the two
    // drift apart and the rider can no longer sign in with the address shown.
    if (typeof incoming.email === "string" && incoming.email !== before.email) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email: incoming.email as string,
        });
        if (error) throw conflict("This email is already registered.", {
            email: "This email is already registered.",
        });
    }

    // Split the flat patch back across the tables it now spans.
    const touchesAddress = ADDRESS_FIELDS.some((f) => f in incoming);
    const touchesContact = CONTACT_FIELDS.some((f) => f in incoming);
    const ownColumns = Object.fromEntries(
        Object.entries(incoming).filter(
            ([k]) =>
                !(ADDRESS_FIELDS as readonly string[]).includes(k) &&
                !(CONTACT_FIELDS as readonly string[]).includes(k),
        ),
    );

    if (Object.keys(ownColumns).length > 0) {
        // The patch is validated by zod (users.validation.ts) but arrives here
        // as an open record, which the generated Update type — deliberately
        // closed, so a stray key is caught — will not accept. The cast is the
        // seam between the two; the zod schema is `.strict()`, so an unknown
        // key never reaches this line.
        const { error } = await supabaseAdmin
            .from("users")
            .update(ownColumns as never)
            .eq("id", id);
        if (error) throw mapPostgresError(error);
    }

    if (touchesAddress) {
        // A partial address patch is merged onto what is already stored — the
        // rider editing only their postcode must not blank the street.
        await writeAddress(id, {
            address_line_1: (incoming.address_line_1 as string) ?? before.address_line_1 ?? undefined,
            address_line_2: (incoming.address_line_2 as string) ?? before.address_line_2 ?? undefined,
            city: (incoming.city as string) ?? before.city ?? undefined,
            state: (incoming.state as string) ?? before.state ?? undefined,
            postal_code: (incoming.postal_code as string) ?? before.postal_code ?? undefined,
            country: (incoming.country as string) ?? before.country ?? undefined,
        });
    }

    if (touchesContact) {
        await writeEmergencyContact(
            id,
            (incoming.emergency_contact_name as string) ?? before.emergency_contact_name ?? undefined,
            (incoming.emergency_contact_phone as string) ?? before.emergency_contact_phone ?? undefined,
        );
    }

    // Any successful profile write — self-service or staff-edited — means the
    // rider is past the first-login onboarding form; this is a one-way flip.
    await markOnboardingComplete(id);

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.updated",
        entityType: "user",
        entityId: id,
        before: pick(before, Object.keys(incoming)),
        after: incoming,
        req,
    });

    return getUserById(id, actor);
}

// ---------------------------------------------------------------------------
// Child-table writers
// ---------------------------------------------------------------------------

/**
 * Upserts the user's primary address.
 *
 * `user_addresses` requires line_1, city, state, postal_code and country, so a
 * patch that names none of them writes nothing rather than inserting a row of
 * empty strings that would fail the check constraints anyway.
 */
async function writeAddress(
    userId: string,
    input: {
        address_line_1?: string; address_line_2?: string; city?: string;
        state?: string; postal_code?: string; country?: string;
    },
): Promise<void> {
    if (!input.address_line_1 || !input.city || !input.state || !input.postal_code) return;

    const { data: existing, error: readError } = await supabaseAdmin
        .from("user_addresses")
        .select("id")
        .eq("user_id", userId)
        .eq("is_primary", true)
        .maybeSingle();
    if (readError) throw readError;

    const row = {
        user_id: userId,
        address_type: "home" as const,
        is_primary: true,
        line_1: input.address_line_1,
        line_2: input.address_line_2 ?? null,
        city: input.city,
        state: input.state,
        postal_code: input.postal_code,
        country: input.country ?? "India",
    };

    const { error } = existing
        ? await supabaseAdmin.from("user_addresses").update(row).eq("id", existing.id)
        : await supabaseAdmin.from("user_addresses").insert(row);
    if (error) throw mapPostgresError(error);
}

/**
 * Upserts the `emergency_contact` related person.
 *
 * A name with no phone is still worth storing — ops calls the rider back and
 * asks — so only an entirely empty pair is treated as "nothing to write".
 */
async function writeEmergencyContact(
    userId: string,
    name?: string,
    phone?: string,
): Promise<void> {
    if (!name) return;

    const { data: existing, error: readError } = await supabaseAdmin
        .from("user_related_persons")
        .select("id")
        .eq("user_id", userId)
        .eq("person_role", "emergency_contact")
        .maybeSingle();
    if (readError) throw readError;

    const row = {
        user_id: userId,
        person_role: "emergency_contact" as const,
        full_name: name,
        phone: phone ? normalisePhone(phone) : null,
    };

    const { error } = existing
        ? await supabaseAdmin.from("user_related_persons").update(row).eq("id", existing.id)
        : await supabaseAdmin.from("user_related_persons").insert(row);
    if (error) throw mapPostgresError(error);
}

/**
 * Makes the role-specific profile row match the role, and stamps the
 * onboarding/staff fields onto it.
 *
 * `handle_new_auth_user` already created one of these; this exists for the
 * case where the role in `user_metadata` was not what the caller ultimately
 * asked for, and for setting fields the trigger has no way to know. The
 * deferred constraint trigger added in migration 30 enforces the pairing at
 * commit, so a mismatch here surfaces as an error rather than a silent
 * inconsistency.
 */
async function ensureRoleProfile(
    userId: string,
    role: UserRole,
    opts: { staffCode?: string; mustChangePassword?: boolean; onboardingCompleted?: boolean },
): Promise<void> {
    if (role === "rider") {
        const { error: dropError } = await supabaseAdmin
            .from("staff_profiles")
            .delete()
            .eq("user_id", userId);
        if (dropError) throw dropError;

        const { error } = await supabaseAdmin.from("rider_profiles").upsert(
            {
                user_id: userId,
                ...(opts.onboardingCompleted
                    ? { onboarding_completed_at: new Date().toISOString() }
                    : {}),
            },
            { onConflict: "user_id" },
        );
        if (error) throw error;
        return;
    }

    const { error: dropError } = await supabaseAdmin
        .from("rider_profiles")
        .delete()
        .eq("user_id", userId);
    if (dropError) throw dropError;

    const { error } = await supabaseAdmin.from("staff_profiles").upsert(
        {
            user_id: userId,
            // staff_code is NOT NULL. When the admin did not supply one, derive
            // a stable placeholder from the id rather than rejecting the
            // creation — operators fill these in later, and blocking account
            // creation on a cosmetic code is not a trade worth making.
            staff_code: opts.staffCode ?? `STAFF-${userId.slice(0, 8).toUpperCase()}`,
            must_change_password: opts.mustChangePassword ?? false,
        },
        { onConflict: "user_id" },
    );
    if (error) throw mapPostgresError(error);
}

/** One-way flip of `rider_profiles.onboarding_completed_at`. No-op for staff. */
async function markOnboardingComplete(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("rider_profiles")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("onboarding_completed_at", null);
    if (error) throw error;
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

/**
 * Uploads to the private profile-photos bucket and stores the storage path
 * (not a URL — the bucket is private) on users.photo_storage_path. Bytes are
 * only ever read back through a signed URL, same pattern as KYC documents.
 */
export async function uploadMyPhoto(
    userId: string,
    file: UploadedFile,
    actor: AuthContext,
    req?: Request,
): Promise<{ profile_photo_url: string }> {
    const before = await requireLiveUser(userId);
    const mime = assertValidPhoto(file);
    const path = buildPhotoPath(userId, mime);

    await uploadPhotoFile(path, file, mime);

    const { error } = await supabaseAdmin
        .from("users")
        .update({ photo_storage_path: path })
        .eq("id", userId);

    if (error) {
        // Compensating action: the row lost, so the bytes must go too.
        await removePhotoFile(path);
        throw error;
    }

    await removePhotoFile(before.profile_photo_url);

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "user.photo_uploaded",
        entityType: "user",
        entityId: userId,
        before: { profile_photo_url: before.profile_photo_url },
        after: { profile_photo_url: path },
        req,
    });

    return { profile_photo_url: path };
}

/**
 * Registers the handset's push token.
 *
 * This used to overwrite a single `users.push_token` column. `user_devices` is
 * a real table with a platform and a revocation timestamp, so the same token
 * arriving again just refreshes `last_seen_at`, and a rider with a phone and a
 * tablet keeps both — the send path fans out over live rows instead of
 * silently reaching whichever device logged in last.
 *
 * `push_token` is globally UNIQUE (a physical handset has exactly one Expo
 * token), so this is an upsert on that key, not on (user_id, push_token): when
 * the same device is handed to a different account — sign out, sign in as
 * someone else — the row is re-pointed at the current user rather than
 * colliding. The upsert is also what makes two near-simultaneous registrations
 * (the app fires this on login AND on the next profile refresh) idempotent
 * instead of racing into a 23505.
 */
export async function registerPushToken(
    userId: string,
    token: string,
    platform: "ios" | "android" = "android",
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("user_devices")
        .upsert(
            {
                user_id: userId,
                push_token: token,
                platform,
                last_seen_at: new Date().toISOString(),
                revoked_at: null,
            },
            { onConflict: "push_token" },
        );

    if (error) throw error;
}

/** Signed URL for the caller's own profile photo. Minted per request, never stored. */
export async function getMyPhotoUrl(userId: string): Promise<{ url: string; expires_in: number }> {
    const row = await requireLiveUser(userId);
    if (!row.profile_photo_url) throw notFound("No profile photo has been uploaded yet.");
    if (!photoPathBelongsToUser(row.profile_photo_url, userId)) {
        throw forbidden("This photo could not be verified as authentic.");
    }
    const url = await createSignedPhotoUrl(row.profile_photo_url);
    return { url, expires_in: 300 };
}

// ---------------------------------------------------------------------------
// Soft delete / restore
// ---------------------------------------------------------------------------

export async function softDeleteUser(id: string, actor: AuthContext, req?: Request): Promise<void> {
    const before = await requireLiveUser(id);

    if (id === actor.id) throw businessRule("You cannot delete your own account.");
    await assertNotLastAdmin(id);

    // Close any live rental first, so the scooter returns to the fleet rather
    // than staying locked to a deleted rider (§15). Invoices, payments and the
    // rental row itself are preserved — only the assignment ends.
    await endActiveRentals(id, "Rider account deleted");

    const { error } = await supabaseAdmin
        .from("users")
        .update({
            deleted_at: new Date().toISOString(),
            status: "inactive",
            status_reason: "Account deleted by administrator",
            status_changed_at: new Date().toISOString(),
        })
        .eq("id", id)
        .is("deleted_at", null);

    if (error) throw mapPostgresError(error);

    // Revoke the session so the token in the rider's pocket stops working now,
    // not whenever it happens to expire.
    const { error: signOutError } = await supabaseAdmin.auth.admin.signOut(id, "global");
    if (signOutError) console.warn("[users.delete] could not revoke sessions", signOutError.message);

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.soft_deleted",
        entityType: "user",
        entityId: id,
        before: { account_status: before.account_status, deleted_at: null },
        after: { account_status: "inactive", deleted_at: "set" },
        req,
    });
}

export async function restoreUser(id: string, actor: AuthContext, req?: Request): Promise<UserDetail> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, email, phone, deleted_at")
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("User not found.");
    if (!data.deleted_at) throw businessRule("This account is not deleted.");

    // The partial unique indexes only cover live rows, so the address may have
    // been taken by someone else while this account was deleted.
    await assertEmailAndPhoneFree(data.email ?? undefined, data.phone ?? undefined, id);

    const { error: updateError } = await supabaseAdmin
        .from("users")
        .update({
            deleted_at: null,
            status: "inactive", // restored, but an admin must re-activate deliberately
            status_reason: "Restored by administrator; awaiting activation",
            status_changed_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (updateError) throw mapPostgresError(updateError);

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.restored",
        entityType: "user",
        entityId: id,
        after: { account_status: "inactive", deleted_at: null },
        req,
    });

    return getUserById(id, actor);
}

// ---------------------------------------------------------------------------
// Account status
// ---------------------------------------------------------------------------

const STATUS_FOR_ACTION: Record<string, UserStatus> = {
    activate: "active",
    deactivate: "inactive",
    suspend: "suspended",
};

export async function changeAccountStatus(
    id: string,
    action: "activate" | "deactivate" | "suspend",
    reason: string | undefined,
    actor: AuthContext,
    req?: Request,
): Promise<UserDetail> {
    const before = await requireLiveUser(id);
    const nextStatus = STATUS_FOR_ACTION[action];

    if (id === actor.id && action !== "activate") {
        throw businessRule("You cannot deactivate or suspend your own account.");
    }
    if (action !== "activate") await assertNotLastAdmin(id);
    if (before.account_status === nextStatus) {
        throw businessRule(`This account is already ${nextStatus}.`);
    }

    if (action !== "activate") await endActiveRentals(id, `Account ${nextStatus}`);

    const { error } = await supabaseAdmin
        .from("users")
        .update({
            status: nextStatus,
            status_reason: reason ?? null,
            status_changed_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) throw mapPostgresError(error);

    if (action !== "activate") {
        await supabaseAdmin.auth.admin.signOut(id, "global");
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: `user.${action}d` as "user.activated" | "user.deactivated" | "user.suspended",
        entityType: "user",
        entityId: id,
        before: { account_status: before.account_status },
        after: { account_status: nextStatus, reason: reason ?? null },
        req,
    });

    return getUserById(id, actor);
}

// ---------------------------------------------------------------------------
// Role
// ---------------------------------------------------------------------------

/**
 * A user has exactly one role now.
 *
 * `getRoles`/`replaceRoles` are gone with `user_roles`. The array shape was
 * always a fiction in practice — nothing in the product ever gave anyone two
 * roles — and the new schema makes that explicit with a single column.
 */
export async function getRole(id: string): Promise<UserRole> {
    const row = await requireLiveUser(id);
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", row.id)
        .single();
    if (error) throw error;
    return data.role;
}

export async function changeRole(
    id: string,
    role: UserRole,
    actor: AuthContext,
    req?: Request,
): Promise<UserRole> {
    await requireLiveUser(id);
    const before = await getRole(id);

    // Privilege escalation guard: an admin cannot use this endpoint to change
    // their own role at all — demoting the last admin and self-promotion are
    // both blocked by the same rule.
    if (id === actor.id) {
        throw forbidden("You cannot change your own role. Ask another administrator.");
    }

    if (before === role) return role;
    if (before === "admin") await assertNotLastAdmin(id);

    const { error } = await supabaseAdmin.from("users").update({ role }).eq("id", id);
    if (error) throw mapPostgresError(error);

    // The profile tables must follow the role — the deferred constraint
    // trigger rejects the transaction otherwise.
    await ensureRoleProfile(id, role, {});

    // A demoted staff member keeps no grants. Deleting them here rather than
    // leaving them dormant means a re-promotion starts from nothing, which is
    // the safe direction for the mistake to fall in.
    if (role === "rider") {
        const { error: revokeError } = await supabaseAdmin
            .from("user_permission_overrides")
            .delete()
            .eq("user_id", id);
        if (revokeError) throw revokeError;
    }

    // Force re-authentication so the JWT's `user_role` claim cannot outlive
    // the change.
    //
    // The REST API is unaffected either way — auth.middleware re-reads
    // `users.role` from the database on every request, deliberately. But RLS
    // does not: `current_role_name()` reads the claim the access-token hook
    // stamped at MINT time, so a demoted admin would keep passing
    // `is_admin()` for the remainder of their token's lifetime. That is not
    // hypothetical reach — it is the admin console's two realtime channels
    // and its one direct PostgREST read, where RLS is the only control there
    // is.
    //
    // Best-effort: the role change itself has committed and is the important
    // part, so a failure here is logged rather than thrown. The exposure it
    // leaves is bounded by the token lifetime.
    // See docs/final-system-audit (finding M9).
    try {
        await supabaseAdmin.auth.admin.signOut(id, "global");
    } catch (err) {
        console.error("[users] could not revoke sessions after role change", {
            userId: id, from: before, to: role,
            error: err instanceof Error ? err.message : String(err),
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.roles_changed",
        entityType: "user_role",
        entityId: id,
        before: { role: before },
        after: { role },
        req,
    });

    return role;
}

// ---------------------------------------------------------------------------
// Shared guards / helpers
// ---------------------------------------------------------------------------

/** Exported for staff-permissions.service.ts — same "must exist, not deleted" guard. */
export async function requireLiveUser(id: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select(PROFILE_SELECT)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("User not found.");
    const row = toProfile(data as unknown as RawUserRow);
    if (row.deleted_at) throw businessRule("This account is deleted. Restore it first.");
    return row;
}

async function assertEmailAndPhoneFree(
    email?: string,
    phone?: string,
    exceptUserId?: string,
): Promise<void> {
    const checks: Array<Promise<void>> = [];

    if (email) {
        checks.push(
            (async () => {
                let q = supabaseAdmin.from("users").select("id").is("deleted_at", null).ilike("email", email);
                if (exceptUserId) q = q.neq("id", exceptUserId);
                const { data, error } = await q.limit(1);
                if (error) throw error;
                if (data && data.length > 0) {
                    throw conflict("This email is already registered.", {
                        email: "This email is already registered.",
                    });
                }
            })(),
        );
    }

    if (phone) {
        checks.push(
            (async () => {
                let q = supabaseAdmin.from("users").select("id").is("deleted_at", null).eq("phone", phone);
                if (exceptUserId) q = q.neq("id", exceptUserId);
                const { data, error } = await q.limit(1);
                if (error) throw error;
                if (data && data.length > 0) {
                    throw conflict("This phone number is already registered.", {
                        phone: "This phone number is already registered.",
                    });
                }
            })(),
        );
    }

    await Promise.all(checks);
}

/**
 * Refuses to remove the system's last route back in.
 *
 * One query now, against a column, where it used to be two against
 * `roles` + `user_roles`.
 */
async function assertNotLastAdmin(userId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("role", "admin")
        .eq("status", "active")
        .is("deleted_at", null);
    if (error) throw error;

    const activeAdmins = data ?? [];
    const isOnlyAdmin =
        activeAdmins.length <= 1 && activeAdmins.some((row) => row.id === userId);

    if (isOnlyAdmin) {
        throw businessRule("This is the last active administrator. Promote another admin first.");
    }
}

/**
 * Ends live rentals so a deleted/suspended rider does not keep a scooter.
 *
 * The vehicle is released by closing its assignment row — `rentals.vehicle_id`
 * is gone, and `recompute_vehicle_status()` (fired by the assignment trigger)
 * is what returns the scooter to `available`.
 */
async function endActiveRentals(userId: string, reason: string): Promise<void> {
    const now = new Date().toISOString();

    const { data: ended, error } = await supabaseAdmin
        .from("rentals")
        .update({ status: "force_ended", returned_at: now, end_reason: reason })
        .eq("user_id", userId)
        .eq("status", "active")
        .select("id");
    if (error) throw error;

    const rentalIds = (ended ?? []).map((r) => r.id);
    if (rentalIds.length === 0) return;

    const { error: releaseError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .update({ released_at: now })
        .in("rental_id", rentalIds)
        .is("released_at", null);
    if (releaseError) throw releaseError;

    console.info("[users] ended active rentals", { userId, reason, count: rentalIds.length });
}

/**
 * The scooter each rider currently holds.
 *
 * `rentals.vehicle_id` no longer exists — a rental's vehicle can change
 * mid-term (breakdown swap, replacement), so the assignment is its own table
 * and `v_rental_current_vehicle` is the view that picks the open row.
 */
async function activeVehicleByUser(
    userIds: string[],
): Promise<Map<string, { id: string; vin: string; model: string; name: string; registration_number: string }>> {
    const map = new Map<string, { id: string; vin: string; model: string; name: string; registration_number: string }>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("user_id, vehicles(id, vin, registration_number, display_name, vehicle_models(name))")
        .in("user_id", userIds);
    if (error) throw error;

    for (const row of data ?? []) {
        if (!row.user_id) continue;
        const v = one<{
            id: string; vin: string; registration_number: string; display_name: string | null;
            vehicle_models: unknown;
        }>(row.vehicles);
        if (!v) continue;
        const modelName = one<{ name: string }>(v.vehicle_models)?.name ?? "";
        map.set(row.user_id, {
            id: v.id,
            vin: v.vin,
            registration_number: v.registration_number,
            model: modelName,
            name: v.display_name ?? modelName,
        });
    }
    return map;
}

/**
 * The rider's current commercial state.
 *
 * Plan state used to be twelve columns on `bookings`. It is a `subscriptions`
 * row now, with the period dates in `subscription_periods` — so this reads the
 * live subscription and, only when there isn't one, falls back to the booking
 * that is still waiting to become one.
 */
async function currentPlanByUser(userIds: string[]): Promise<Map<string, {
    plan: { id: string; name: string; price: number; billing_cycle: string } | null;
    payment_status: UserListItem["payment_status"];
    plan_started_at: string | null;
    next_due_at: string | null;
}>> {
    type Entry = {
        plan: { id: string; name: string; price: number; billing_cycle: string } | null;
        payment_status: UserListItem["payment_status"];
        plan_started_at: string | null;
        next_due_at: string | null;
    };
    const map = new Map<string, Entry>();
    if (userIds.length === 0) return map;

    const [subsRes, periodsRes] = await Promise.all([
        supabaseAdmin
            .from("subscriptions")
            .select("id, user_id, status, started_on, plan_price_snapshot, billing_period_snapshot, plans(id, name)")
            .in("user_id", userIds)
            .in("status", ["active", "paused", "past_due"])
            .order("started_on", { ascending: false }),
        supabaseAdmin
            .from("v_subscription_current_period")
            .select("user_id, subscription_id, due_on")
            .in("user_id", userIds),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (periodsRes.error) throw periodsRes.error;

    const dueBySubscription = new Map<string, string | null>(
        (periodsRes.data ?? [])
            .filter((p) => p.subscription_id)
            .map((p) => [p.subscription_id as string, p.due_on] as const),
    );

    for (const row of subsRes.data ?? []) {
        if (map.has(row.user_id)) continue; // newest first — first hit per user wins
        const plan = one<{ id: string; name: string }>(row.plans);
        map.set(row.user_id, {
            plan: plan
                ? {
                    id: plan.id,
                    name: plan.name,
                    // The snapshot, not plans.price_amount: what the rider
                    // actually pays is what was agreed when they subscribed.
                    price: Number(row.plan_price_snapshot),
                    billing_cycle: row.billing_period_snapshot,
                }
                : null,
            payment_status: row.status as Entry["payment_status"],
            plan_started_at: row.started_on,
            next_due_at: dueBySubscription.get(row.id) ?? null,
        });
    }

    // Riders who have booked but not yet paid/picked up have no subscription.
    const withoutSubscription = userIds.filter((id) => !map.has(id));
    if (withoutSubscription.length === 0) return map;

    const { data: bookings, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("user_id, status, created_at, plans(id, name, price_amount, billing_period)")
        .in("user_id", withoutSubscription)
        .in("status", ["pending_payment", "confirmed"])
        .order("created_at", { ascending: false });
    if (bookingError) throw bookingError;

    for (const row of bookings ?? []) {
        if (map.has(row.user_id)) continue;
        const plan = one<{ id: string; name: string; price_amount: number; billing_period: string }>(row.plans);
        map.set(row.user_id, {
            plan: plan
                ? {
                    id: plan.id,
                    name: plan.name,
                    price: Number(plan.price_amount),
                    billing_cycle: plan.billing_period,
                }
                : null,
            payment_status: row.status as Entry["payment_status"],
            plan_started_at: null,
            next_due_at: null,
        });
    }

    return map;
}

/**
 * Real money each rider owes right now — the sum of every unpaid, non-void
 * invoice balance from `v_invoice_balances`. This is the honest answer to
 * "is this rider due?", independent of whether a plan is still active: a
 * fully-paid rider with a completed rental owes 0, and a rider with an
 * unpaid return settlement owes that amount even after the plan has ended.
 */
async function outstandingByUser(userIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("user_id, balance_amount, is_paid, status")
        .in("user_id", userIds);
    if (error) throw error;

    for (const row of data ?? []) {
        if (!row.user_id || row.is_paid || row.status === "void") continue;
        const balance = Number(row.balance_amount);
        if (balance <= 0) continue;
        map.set(row.user_id, Math.round(((map.get(row.user_id) ?? 0) + balance) * 100) / 100);
    }
    return map;
}

/**
 * Whether this rider currently has a live rental — computed server-side
 * (never trust a client-supplied flag). Backs both the mobile post-booking
 * dashboard gate and bookings.service.ts's re-booking guard.
 */
export async function hasActiveRentalForUser(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", "active");
    if (error) throw error;
    return (count ?? 0) > 0;
}

/** Last successful sign-in, from Auth. See the note on UserDetail. */
async function lastLoginFor(userId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error) {
        // Never fail a profile read over a nice-to-have timestamp.
        console.warn("[users] could not read last sign-in", { userId, error: error.message });
        return null;
    }
    return data.user?.last_sign_in_at ?? null;
}

async function documentsForUser(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("kyc_documents")
        .select(
            "id, document_type, document_number_last4, verification_status, rejection_reason, expires_on, submitted_at, verified_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;

    // Deliberately NOT renamed here. The API's `doc_type` rename is
    // applied once, where the response is assembled, so everything in between
    // — kycCompletionPercent above all — speaks the column names and cannot be
    // fed a shape it does not recognise.
    return (data ?? []).map((d) => ({
        id: d.id,
        document_type: d.document_type as string,
        document_number_last4: d.document_number_last4,
        verification_status: d.verification_status as string,
        rejection_reason: d.rejection_reason,
        expires_on: d.expires_on,
        submitted_at: d.submitted_at,
        verified_at: d.verified_at,
    }));
}

function pick<T extends object>(source: T, keys: string[]): Record<string, unknown> {
    const record = source as unknown as Record<string, unknown>;
    return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]));
}

/** PostgREST treats % and _ as wildcards inside ilike patterns. */
function escapeLike(input: string): string {
    return input.replace(/[%_\\,()]/g, "");
}

function isDuplicateAuthUser(error: unknown): boolean {
    const message = (error as { message?: string } | null)?.message?.toLowerCase() ?? "";
    return message.includes("already been registered") || message.includes("already exists");
}

/**
 * Turns a constraint violation into a clean 409/422 instead of a 500.
 * 23505 = unique_violation, 23514 = check_violation, P0001 = raise exception.
 */
function mapPostgresError(error: { code?: string; message?: string }): Error {
    if (error.code === "23505") {
        if (error.message?.includes("email")) {
            return conflict("This email is already registered.", {
                email: "This email is already registered.",
            });
        }
        if (error.message?.includes("phone")) {
            return conflict("This phone number is already registered.", {
                phone: "This phone number is already registered.",
            });
        }
        if (error.message?.includes("staff_code")) {
            return conflict("That staff code is already in use.", {
                staff_code: "That staff code is already in use.",
            });
        }
        return conflict("That value is already in use.");
    }
    if (error.code === "23514" || error.code === "P0001") {
        return businessRule("That change is not allowed by the current account rules.");
    }
    return error as Error;
}

export const STAFF_ROLE_LIST = STAFF_ROLES;
