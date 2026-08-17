import type { Request } from "express";
import { randomInt } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { maskLast4 } from "../../common/mask";
import {
    AccountStatus, AuthContext, MANDATORY_KYC_DOC_TYPES, Paginated, RoleName,
    STAFF_ROLES, StaffCapability,
} from "../../types";
import { ListUsersFilters, UserDetail, UserListItem, UserProfile } from "./users.types";
import { normaliseEmail, normalisePhone } from "./users.validation";
import { PermissionProfileName } from "../../config/permissionProfiles";
import { applyPermissionProfile } from "./staff-permissions.service";
import {
    assertValidPhoto, buildPhotoPath, createSignedPhotoUrl, photoPathBelongsToUser,
    removePhotoFile, uploadPhotoFile,
} from "./users.photo.storage";
import type { UploadedFile } from "../kyc/kyc.storage";

/**
 * PostgREST embed for a user's roles.
 *
 * The `!user_roles_user_id_fkey` disambiguator is required, not stylistic:
 * user_roles has two foreign keys to users (`user_id` and `granted_by`), so a
 * bare `user_roles(roles(name))` is ambiguous and PostgREST answers
 * 300 Multiple Choices instead of choosing. Same applies to
 * user_capabilities in auth.middleware.ts.
 */
const ROLES_EMBED = "user_roles!user_roles_user_id_fkey(roles(name))";

const PROFILE_COLUMNS = `
    id, full_name, email, phone, date_of_birth, gender,
    address_line_1, address_line_2, city, state, postal_code, country,
    emergency_contact_name, emergency_contact_phone,
    account_status, kyc_status, profile_photo_url, profile_completed,
    created_at, updated_at, deleted_at, staff_code, last_login_at, must_change_password
`;

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listUsers(
    filters: ListUsersFilters,
    actor: AuthContext,
): Promise<Paginated<UserListItem>> {
    // includeDeleted is admin-only; staff silently never see deleted rows.
    const includeDeleted = filters.includeDeleted && actor.roles.includes("admin");

    let query = supabaseAdmin
        .from("users")
        .select(`${PROFILE_COLUMNS}, ${ROLES_EMBED}`, { count: "exact" });

    if (!includeDeleted) query = query.is("deleted_at", null);
    if (filters.accountStatus) query = query.eq("account_status", filters.accountStatus);
    if (filters.kycStatus) query = query.eq("kyc_status", filters.kycStatus);

    if (filters.search) {
        const term = escapeLike(filters.search);
        // Name, email and phone only.
        //
        // Search by document number was REMOVED with the identity-number
        // minimisation. Only the last four characters are stored now, so the
        // feature would have become both less useful and more leaky: a
        // four-character search returns every rider sharing those digits, and
        // each hit is a disclosure to whoever typed it. Ops keeps name/phone,
        // which is what they actually search by.
        query = query.or([
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
        ].join(","));
    }

    if (filters.role) {
        const ids = await userIdsWithRole(filters.role);
        if (ids.length === 0) return paginate<UserListItem>([], 0, filters);
        query = query.in("id", ids);
    } else if (filters.staffOnly) {
        const ids = await userIdsWithAnyStaffRole();
        if (ids.length === 0) return paginate<UserListItem>([], 0, filters);
        query = query.in("id", ids);
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<UserProfile & { user_roles?: unknown }>;
    const userIds = rows.map((r) => r.id);
    const [vehicles, plans] = await Promise.all([
        activeVehicleByUser(userIds),
        currentPlanByUser(userIds),
    ]);

    const items: UserListItem[] = rows.map((row) => {
        const planInfo = plans.get(row.id);
        return {
            ...stripJoins(row),
            roles: flattenRoles(row),
            assigned_vehicle: vehicles.get(row.id) ?? null,
            current_plan: planInfo?.plan ?? null,
            payment_status: planInfo?.payment_status ?? null,
            plan_started_at: planInfo?.plan_started_at ?? null,
            next_due_at: planInfo?.next_due_at ?? null,
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
        .select(`${PROFILE_COLUMNS}, ${ROLES_EMBED}`)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("User not found.");

    const row = data as unknown as UserProfile & { user_roles?: unknown };

    // Deleted profiles are visible to admins only.
    if (row.deleted_at && !actor.roles.includes("admin")) throw notFound("User not found.");

    const [vehicles, plans, documents] = await Promise.all([
        activeVehicleByUser([id]),
        currentPlanByUser([id]),
        documentsForUser(id),
    ]);
    const planInfo = plans.get(id);

    return {
        ...stripJoins(row),
        roles: flattenRoles(row),
        assigned_vehicle: vehicles.get(id) ?? null,
        current_plan: planInfo?.plan ?? null,
        payment_status: planInfo?.payment_status ?? null,
        plan_started_at: planInfo?.plan_started_at ?? null,
        next_due_at: planInfo?.next_due_at ?? null,
        kyc_completion_percent: kycCompletionPercent(documents),
        // Storage paths are never included — see §2 "Do not expose confidential
        // storage paths". Bytes are reached only via POST /kyc signed-url flows.
        documents: documents.map((d) => ({
            id: d.id,
            doc_type: d.doc_type,
            doc_number_masked: maskLast4(d.doc_number_last4),
            verification_status: d.verification_status,
            rejection_reason: d.rejection_reason,
            expiry_date: d.expiry_date,
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
    docs: Array<{ doc_type: string; verification_status: string; expiry_date: string | null }>,
): number {
    const today = new Date().toISOString().slice(0, 10);
    const verified = MANDATORY_KYC_DOC_TYPES.filter((type) =>
        docs.some(
            (d) =>
                d.doc_type === type &&
                d.verification_status === "verified" &&
                (!d.expiry_date || d.expiry_date >= today),
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
    role: RoleName;
    account_status: AccountStatus;
    staff_code?: string;
    permission_profile?: Exclude<PermissionProfileName, "custom">;
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
 * Creates the Auth user, then the profile, then the role.
 *
 * Supabase gives us no cross-service transaction, so this uses a compensating
 * action: if any step after Auth creation fails, the Auth user is deleted
 * again and the original error surfaces. Note that 008_integrity_fixes adds an
 * AFTER INSERT trigger on auth.users which already creates a bare profile row,
 * so the profile write is an UPDATE-by-id rather than an INSERT.
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
    if (input.role !== "rider" && !actor.roles.includes("admin")) {
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
            user_metadata: { full_name: input.full_name },
        })
        : await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: { full_name: input.full_name },
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
                address_line_1: input.address_line_1 ?? null,
                address_line_2: input.address_line_2 ?? null,
                city: input.city ?? null,
                state: input.state ?? null,
                postal_code: input.postal_code ?? null,
                country: input.country ?? null,
                emergency_contact_name: input.emergency_contact_name ?? null,
                emergency_contact_phone: input.emergency_contact_phone
                    ? normalisePhone(input.emergency_contact_phone)
                    : null,
                account_status: input.account_status,
                staff_code: input.staff_code ?? null,
                // An admin-created account arrives with a full profile already —
                // it should never be routed through the first-login onboarding form.
                profile_completed: true,
                must_change_password: isStaffAccount,
            })
            .eq("id", authUserId)
            .select("id")
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Profile row was not provisioned for the new auth user");

        await setRoles(authUserId, [input.role], actor.id);

        // Applied after the role so it can see the freshly-granted "staff"
        // role (replaceModulePermissions requires it). Inside the same
        // try/catch as everything else above: if this throws, the outer
        // catch's compensating deleteUser() still fires, so a profile-apply
        // failure never leaves a half-provisioned staff account behind.
        if (input.permission_profile && STAFF_ROLES.includes(input.role)) {
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
 * module permissions (resolveModuleAccess blocks everything without an
 * explicit grant) and `account_status: "inactive"`, so an admin must
 * deliberately activate the account before it can even log in (see the
 * STAFF_ROLES + inactive check in auth.middleware.ts's requireAuth). The
 * caller chooses their own password, so there's no temp password and no
 * forced must_change_password — unlike admin-created staff accounts.
 */
export async function selfSignUpStaff(input: SelfSignUpInput, req?: Request): Promise<{ full_name: string; email: string }> {
    const email = normaliseEmail(input.email);
    const phone = normalisePhone(input.phone);

    await assertEmailAndPhoneFree(email, phone);

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        phone,
        password: input.password,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: { full_name: input.full_name },
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
                account_status: "inactive",
                status_reason: "Self-registered — awaiting admin approval",
                status_changed_at: new Date().toISOString(),
                profile_completed: true,
                must_change_password: false,
            })
            .eq("id", authUserId)
            .select("id")
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Profile row was not provisioned for the new auth user");

        // Overwrites the trigger's auto-granted "rider" role — see
        // handle_new_auth_user() in 20260720100600_auth.sql.
        await setRoles(authUserId, ["staff"], null);

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

export async function updateUser(
    id: string,
    patch: Record<string, unknown>,
    actor: AuthContext,
    req?: Request,
): Promise<UserDetail> {
    const before = await requireLiveUser(id);

    const next: Record<string, unknown> = { ...patch };
    // Any successful profile write — self-service or staff-edited — means the
    // rider is past the first-login onboarding form; this is a one-way flip.
    next.profile_completed = true;
    if (typeof next.email === "string") next.email = normaliseEmail(next.email);
    if (typeof next.phone === "string") next.phone = normalisePhone(next.phone);
    if (typeof next.emergency_contact_phone === "string") {
        next.emergency_contact_phone = normalisePhone(next.emergency_contact_phone);
    }

    await assertEmailAndPhoneFree(
        typeof next.email === "string" ? next.email : undefined,
        typeof next.phone === "string" ? next.phone : undefined,
        id,
    );

    // Changing the login email means changing it in Auth too, or the two
    // drift apart and the rider can no longer sign in with the address shown.
    if (typeof next.email === "string" && next.email !== before.email) {
        const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
            email: next.email as string,
        });
        if (error) throw conflict("This email is already registered.", {
            email: "This email is already registered.",
        });
    }

    const { error } = await supabaseAdmin.from("users").update(next).eq("id", id);
    if (error) throw mapPostgresError(error);

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.updated",
        entityType: "user",
        entityId: id,
        before: pick(before, Object.keys(next)),
        after: next,
        req,
    });

    return getUserById(id, actor);
}

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

/**
 * Uploads to the private profile-photos bucket and stores the storage path
 * (not a URL — the bucket is private) on users.profile_photo_url. Bytes are
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
        .update({ profile_photo_url: path })
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
 * Overwrites any previous token — a rider is assumed to have at most one
 * "current" device for push purposes; a stale token just fails silently on
 * next send.
 */
export async function registerPushToken(userId: string, token: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("users")
        .update({ push_token: token })
        .eq("id", userId);

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
            account_status: "inactive",
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
            account_status: "inactive", // restored, but an admin must re-activate deliberately
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

const STATUS_FOR_ACTION: Record<string, AccountStatus> = {
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
            account_status: nextStatus,
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
// Roles
// ---------------------------------------------------------------------------

export async function getRoles(id: string): Promise<RoleName[]> {
    await requireLiveUser(id);
    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("roles(name)")
        .eq("user_id", id);
    if (error) throw error;
    return flattenRoles({ user_roles: data });
}

export async function replaceRoles(
    id: string,
    roles: RoleName[],
    actor: AuthContext,
    req?: Request,
): Promise<RoleName[]> {
    await requireLiveUser(id);
    const before = await getRoles(id);

    // Privilege escalation guard: an admin cannot use this endpoint to change
    // their own role set at all — removing the last admin and self-promotion
    // are both blocked by the same rule.
    if (id === actor.id) {
        throw forbidden("You cannot change your own roles. Ask another administrator.");
    }

    if (roles.length === 0) throw businessRule("A user must keep at least one role.");

    if (before.includes("admin") && !roles.includes("admin")) {
        await assertNotLastAdmin(id);
    }

    await setRoles(id, roles, actor.id);

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.roles_changed",
        entityType: "user_role",
        entityId: id,
        before: { roles: before },
        after: { roles },
        req,
    });

    return roles;
}

async function setRoles(userId: string, roles: RoleName[], grantedBy: string | null): Promise<void> {
    const { data: roleRows, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("id, name")
        .in("name", roles);
    if (roleError) throw roleError;

    const found = (roleRows ?? []) as Array<{ id: number; name: RoleName }>;
    const missing = roles.filter((r) => !found.some((row) => row.name === r));
    if (missing.length > 0) throw businessRule(`Unknown role(s): ${missing.join(", ")}.`);

    const { error: deleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .not("role_id", "in", `(${found.map((r) => r.id).join(",")})`);
    if (deleteError) throw deleteError;

    const { error: insertError } = await supabaseAdmin.from("user_roles").upsert(
        found.map((r) => ({ user_id: userId, role_id: r.id, granted_by: grantedBy })),
        { onConflict: "user_id,role_id", ignoreDuplicates: true },
    );
    if (insertError) throw insertError;
}

// ---------------------------------------------------------------------------
// Capabilities (DPDPA s.8(5) — least privilege over raw personal data)
// ---------------------------------------------------------------------------

export async function getCapabilities(id: string): Promise<StaffCapability[]> {
    await requireLiveUser(id);
    const { data, error } = await supabaseAdmin
        .from("user_capabilities")
        .select("capability")
        .eq("user_id", id);
    if (error) throw error;
    return (data ?? []).map((row) => row.capability as StaffCapability);
}

/**
 * Replaces a staff member's capability set wholesale.
 *
 * Self-modification is blocked for the same reason replaceRoles blocks it: an
 * admin who can grant themselves kyc_reviewer has not been restricted from
 * anything. Two people are required, and both halves are in the audit trail.
 */
export async function replaceCapabilities(
    id: string,
    capabilities: StaffCapability[],
    actor: AuthContext,
    req?: Request,
): Promise<StaffCapability[]> {
    await requireLiveUser(id);

    if (id === actor.id) {
        throw forbidden(
            "You cannot change your own capabilities. Ask another administrator.",
        );
    }

    const before = await getCapabilities(id);
    const wanted = [...new Set(capabilities)];

    const removed = before.filter((c) => !wanted.includes(c));
    if (removed.length > 0) {
        const { error } = await supabaseAdmin
            .from("user_capabilities")
            .delete()
            .eq("user_id", id)
            .in("capability", removed);
        if (error) throw error;
    }

    const added = wanted.filter((c) => !before.includes(c));
    if (added.length > 0) {
        const { error } = await supabaseAdmin.from("user_capabilities").upsert(
            added.map((capability) => ({ user_id: id, capability, granted_by: actor.id })),
            { onConflict: "user_id,capability", ignoreDuplicates: true },
        );
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: id,
        action: "user.capabilities_changed",
        entityType: "user_capability",
        entityId: id,
        before: { capabilities: before },
        after: { capabilities: wanted },
        req,
    });

    return wanted;
}

// ---------------------------------------------------------------------------
// Shared guards / helpers
// ---------------------------------------------------------------------------

/** Exported for staff-permissions.service.ts — same "must exist, not deleted" guard. */
export async function requireLiveUser(id: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select(PROFILE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("User not found.");
    const row = data as unknown as UserProfile;
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

/** Refuses to remove the system's last route back in. */
async function assertNotLastAdmin(userId: string): Promise<void> {
    const { data: adminRole, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("id")
        .eq("name", "admin")
        .single();
    if (roleError) throw roleError;

    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, users!user_roles_user_id_fkey!inner(account_status, deleted_at)")
        .eq("role_id", adminRole.id)
        .is("users.deleted_at", null)
        .eq("users.account_status", "active");
    if (error) throw error;

    const activeAdmins = (data ?? []) as Array<{ user_id: string }>;
    const isOnlyAdmin =
        activeAdmins.length <= 1 && activeAdmins.some((row) => row.user_id === userId);

    if (isOnlyAdmin) {
        throw businessRule("This is the last active administrator. Promote another admin first.");
    }
}

/**
 * Ends live rentals so a deleted/suspended rider does not keep a scooter.
 * trg_sync_vehicle_status (008) returns the vehicle to 'available'.
 */
async function endActiveRentals(userId: string, reason: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("rentals")
        .update({ status: "force_ended", ended_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("status", "active");
    if (error) throw error;
    console.info("[users] ended active rentals", { userId, reason });
}

async function userIdsWithRole(role: RoleName): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, roles!inner(name)")
        .eq("roles.name", role);
    if (error) throw error;
    return (data ?? []).map((r) => (r as { user_id: string }).user_id);
}

/**
 * Every account holding any staff-side role. `role` filters to exactly one,
 * which was fine when "admin" was the only non-rider role that existed; the
 * capabilities screen needs the whole staff population in one query.
 */
async function userIdsWithAnyStaffRole(): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, roles!inner(name)")
        .in("roles.name", STAFF_ROLES as unknown as string[]);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
}

async function activeVehicleByUser(
    userIds: string[],
): Promise<Map<string, { id: string; vin: string; model: string; name: string; registration_number: string }>> {
    const map = new Map<string, { id: string; vin: string; model: string; name: string; registration_number: string }>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("user_id, vehicles(id, vin, model, name, registration_number)")
        .in("user_id", userIds)
        .eq("status", "active");
    if (error) throw error;

    for (const row of (data ?? []) as Array<{ user_id: string; vehicles: unknown }>) {
        const v = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
        if (v) map.set(row.user_id, v as { id: string; vin: string; model: string; name: string; registration_number: string });
    }
    return map;
}

/**
 * "subscriptions" is dead — nothing in the app has written to that table
 * since the recurring-billing engine moved plan state onto bookings
 * (plan_id/plan_status/next_due_at). This reads the rider's current live
 * booking instead — same source, same derivation, as
 * vehicles.service.ts's paymentStatusesForVehicles: bookings.status before
 * pickup (pending_payment/confirmed), bookings.plan_status once fulfilled.
 */
async function currentPlanByUser(userIds: string[]): Promise<Map<string, {
    plan: { id: string; name: string; price: number; billing_cycle: string } | null;
    payment_status: "pending_payment" | "confirmed" | "active" | "due" | "paused" | null;
    plan_started_at: string | null;
    next_due_at: string | null;
}>> {
    const map = new Map<string, {
        plan: { id: string; name: string; price: number; billing_cycle: string } | null;
        payment_status: "pending_payment" | "confirmed" | "active" | "due" | "paused" | null;
        plan_started_at: string | null;
        next_due_at: string | null;
    }>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("user_id, status, plan_status, created_at, plan_activated_at, next_due_at, plans(id, name, price, billing_cycle)")
        .in("user_id", userIds)
        .in("status", ["pending_payment", "confirmed", "fulfilled"])
        .order("created_at", { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as Array<{
        user_id: string; status: string; plan_status: string | null; plans: unknown;
        plan_activated_at: string | null; next_due_at: string | null;
    }>) {
        if (map.has(row.user_id)) continue; // newest first — first hit per user wins
        const p = Array.isArray(row.plans) ? row.plans[0] : row.plans;
        const plan = p as { id: string; name: string; price: number | string; billing_cycle: string } | null;
        map.set(row.user_id, {
            plan: plan ? { id: plan.id, name: plan.name, price: Number(plan.price), billing_cycle: plan.billing_cycle } : null,
            payment_status: (row.status === "fulfilled" ? row.plan_status : row.status) as
                "pending_payment" | "confirmed" | "active" | "due" | "paused" | null,
            plan_started_at: row.plan_activated_at,
            next_due_at: row.next_due_at,
        });
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

async function documentsForUser(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .select(
            "id, doc_type, doc_number_last4, verification_status, rejection_reason, expiry_date, submitted_at, verified_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Array<{
        id: string;
        doc_type: string;
        doc_number_last4: string | null;
        verification_status: string;
        rejection_reason: string | null;
        expiry_date: string | null;
        submitted_at: string | null;
        verified_at: string | null;
    }>;
}

type RoleJoin = { roles: { name: RoleName } | { name: RoleName }[] | null };

function flattenRoles(row: unknown): RoleName[] {
    const rows = ((row as { user_roles?: RoleJoin[] | null }).user_roles ?? []) as RoleJoin[];
    const names = rows.flatMap((r) => {
        if (!r.roles) return [];
        return Array.isArray(r.roles) ? r.roles.map((x) => x.name) : [r.roles.name];
    });
    return [...new Set(names)];
}

function stripJoins(row: UserProfile & { user_roles?: unknown }): UserProfile {
    const { user_roles: _ignored, ...profile } = row;
    return profile;
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
        return conflict("That value is already in use.");
    }
    if (error.code === "23514" || error.code === "P0001") {
        return businessRule("That change is not allowed by the current account rules.");
    }
    return error as Error;
}

export const STAFF_ROLE_LIST = STAFF_ROLES;
