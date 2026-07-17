import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { businessRule, conflict, forbidden, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { maskDocumentNumber } from "../../common/mask";
import {
    AccountStatus, AuthContext, MANDATORY_KYC_DOC_TYPES, Paginated, RoleName, STAFF_ROLES,
} from "../../types";
import { ListUsersFilters, UserDetail, UserListItem, UserProfile } from "./users.types";
import { normaliseEmail, normalisePhone } from "./users.validation";

const PROFILE_COLUMNS = `
    id, full_name, email, phone, date_of_birth, gender,
    address_line_1, address_line_2, city, state, postal_code, country,
    emergency_contact_name, emergency_contact_phone,
    account_status, kyc_status, profile_photo_url,
    created_at, updated_at, deleted_at
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
        .select(`${PROFILE_COLUMNS}, user_roles(roles(name))`, { count: "exact" });

    if (!includeDeleted) query = query.is("deleted_at", null);
    if (filters.accountStatus) query = query.eq("account_status", filters.accountStatus);
    if (filters.kycStatus) query = query.eq("kyc_status", filters.kycStatus);

    if (filters.search) {
        const term = escapeLike(filters.search);
        // Search by name/email/phone here; document-number search is resolved
        // separately below because it lives on user_documents.
        const idsFromDocs = await userIdsMatchingDocNumber(filters.search);
        const clauses = [
            `full_name.ilike.%${term}%`,
            `email.ilike.%${term}%`,
            `phone.ilike.%${term}%`,
        ];
        if (idsFromDocs.length > 0) clauses.push(`id.in.(${idsFromDocs.join(",")})`);
        query = query.or(clauses.join(","));
    }

    if (filters.role) {
        const ids = await userIdsWithRole(filters.role);
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
        activePlanByUser(userIds),
    ]);

    const items: UserListItem[] = rows.map((row) => ({
        ...stripJoins(row),
        roles: flattenRoles(row),
        assigned_vehicle: vehicles.get(row.id) ?? null,
        current_plan: plans.get(row.id) ?? null,
    }));

    return paginate(items, count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getUserById(id: string, actor: AuthContext): Promise<UserDetail> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select(`${PROFILE_COLUMNS}, user_roles(roles(name))`)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("User not found.");

    const row = data as unknown as UserProfile & { user_roles?: unknown };

    // Deleted profiles are visible to admins only.
    if (row.deleted_at && !actor.roles.includes("admin")) throw notFound("User not found.");

    const [vehicles, plans, documents] = await Promise.all([
        activeVehicleByUser([id]),
        activePlanByUser([id]),
        documentsForUser(id),
    ]);

    return {
        ...stripJoins(row),
        roles: flattenRoles(row),
        assigned_vehicle: vehicles.get(id) ?? null,
        current_plan: plans.get(id) ?? null,
        kyc_completion_percent: kycCompletionPercent(documents),
        // Storage paths are never included — see §2 "Do not expose confidential
        // storage paths". Bytes are reached only via POST /kyc signed-url flows.
        documents: documents.map((d) => ({
            id: d.id,
            doc_type: d.doc_type,
            doc_number_masked: maskDocumentNumber(d.doc_number),
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
}

/**
 * Creates the Auth user, then the profile, then the role.
 *
 * Supabase gives us no cross-service transaction, so this uses a compensating
 * action: if any step after Auth creation fails, the Auth user is deleted
 * again and the original error surfaces. Note that 008_integrity_fixes adds an
 * AFTER INSERT trigger on auth.users which already creates a bare profile row,
 * so the profile write is an UPDATE-by-id rather than an INSERT.
 */
export async function createUser(
    input: CreateUserInput,
    actor: AuthContext,
    req?: Request,
): Promise<UserDetail> {
    const email = normaliseEmail(input.email);
    const phone = normalisePhone(input.phone);

    await assertEmailAndPhoneFree(email, phone);

    // Only an admin may mint a non-rider account.
    if (input.role !== "rider" && !actor.roles.includes("admin")) {
        throw forbidden("Only an administrator may create staff or admin accounts.");
    }

    const { data: created, error: authError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
            data: { full_name: input.full_name },
            ...(env.inviteRedirectUrl ? { redirectTo: env.inviteRedirectUrl } : {}),
        },
    );

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
            })
            .eq("id", authUserId)
            .select("id")
            .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) throw new Error("Profile row was not provisioned for the new auth user");

        await setRoles(authUserId, [input.role], actor.id);

        await writeAudit({
            actorId: actor.id,
            targetUserId: authUserId,
            action: "user.created",
            entityType: "user",
            entityId: authUserId,
            after: { email, phone, role: input.role, account_status: input.account_status },
            req,
        });

        return getUserById(authUserId, actor);
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

async function setRoles(userId: string, roles: RoleName[], grantedBy: string): Promise<void> {
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
// Shared guards / helpers
// ---------------------------------------------------------------------------

async function requireLiveUser(id: string): Promise<UserProfile> {
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
        .select("user_id, users!inner(account_status, deleted_at)")
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

async function userIdsMatchingDocNumber(search: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .select("user_id")
        .ilike("doc_number", `%${escapeLike(search)}%`)
        .limit(200);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => (r as { user_id: string }).user_id))];
}

async function activeVehicleByUser(
    userIds: string[],
): Promise<Map<string, { id: string; vin: string; model: string }>> {
    const map = new Map<string, { id: string; vin: string; model: string }>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("user_id, vehicles(id, vin, model)")
        .in("user_id", userIds)
        .eq("status", "active");
    if (error) throw error;

    for (const row of (data ?? []) as Array<{ user_id: string; vehicles: unknown }>) {
        const v = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
        if (v) map.set(row.user_id, v as { id: string; vin: string; model: string });
    }
    return map;
}

async function activePlanByUser(
    userIds: string[],
): Promise<Map<string, { id: string; name: string; status: string }>> {
    const map = new Map<string, { id: string; name: string; status: string }>();
    if (userIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, status, plans(id, name)")
        .in("user_id", userIds)
        .eq("status", "active");
    if (error) throw error;

    for (const row of (data ?? []) as Array<{ user_id: string; status: string; plans: unknown }>) {
        const p = Array.isArray(row.plans) ? row.plans[0] : row.plans;
        if (p) {
            const plan = p as { id: string; name: string };
            map.set(row.user_id, { id: plan.id, name: plan.name, status: row.status });
        }
    }
    return map;
}

async function documentsForUser(userId: string) {
    const { data, error } = await supabaseAdmin
        .from("user_documents")
        .select(
            "id, doc_type, doc_number, verification_status, rejection_reason, expiry_date, submitted_at, verified_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Array<{
        id: string;
        doc_type: string;
        doc_number: string;
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
