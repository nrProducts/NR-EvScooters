import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthContext, RoleName, STAFF_ROLES, StaffCapability } from "../types";
import { unauthenticated, forbidden } from "../common/AppError";

export interface AuthedRequest extends Request {
    /**
     * Populated only by requireAuth, only from the verified access token.
     * Roles are read from the database — never from the request body/headers.
     */
    user?: AuthContext;
}

/**
 * Verifies the Supabase access token and resolves the caller's profile +
 * roles in one round trip. Replaces the previous version, which set
 * `{ id }` and left `role` permanently undefined.
 */
export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token) {
        console.warn("[auth] rejected: missing token", { path: req.originalUrl });
        return next(unauthenticated("Missing access token."));
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
        console.warn("[auth] rejected: token invalid", {
            path: req.originalUrl,
            reason: error?.message ?? "no user for token",
        });
        return next(unauthenticated("Invalid or expired access token."));
    }

    const { data: profile, error: profileError } = await supabaseAdmin
        .from("users")
        // Two things this select has to get right:
        //
        // 1. It must stay a SINGLE STRING LITERAL. PostgREST infers the row
        //    type from it, and concatenation widens it to `string`, losing that.
        //
        // 2. Both embeds MUST name their foreign key explicitly. user_roles and
        //    user_capabilities each have TWO foreign keys to users (`user_id`
        //    and `granted_by`), so a bare `user_roles(...)` is ambiguous and
        //    PostgREST answers 300 Multiple Choices rather than picking one.
        //    Because this runs in requireAuth, that 300 fails EVERY
        //    authenticated request — the whole product, both apps.
        //
        // Both sides of the merge arrived at the user_roles disambiguator
        // independently, which is a good sign it is the right fix; this keeps
        // it and adds the same treatment for user_capabilities.
        .select("id, email, account_status, kyc_status, deleted_at, user_roles!user_roles_user_id_fkey(roles(name)), user_capabilities!user_capabilities_user_id_fkey(capability)")
        .eq("id", data.user.id)
        .maybeSingle();

    if (profileError) return next(profileError);
    if (!profile) {
        console.warn("[auth] rejected: no profile row", { path: req.originalUrl, userId: data.user.id });
        return next(unauthenticated("No profile exists for this account."));
    }

    // A soft-deleted account must not authenticate as an active rider (§15).
    if (profile.deleted_at) {
        console.warn("[auth] rejected: account deleted", { path: req.originalUrl, userId: profile.id });
        return next(forbidden("This account has been deactivated."));
    }
    if (profile.account_status === "suspended") {
        console.warn("[auth] rejected: account suspended", { path: req.originalUrl, userId: profile.id });
        return next(forbidden("This account is suspended."));
    }

    const roles = extractRoles(profile);

    // A self-signed-up or newly-created staff/admin account starts inactive
    // until an admin activates it (see selfSignUpStaff() / AddStaffDialog).
    // Riders are never gated on this — they can be inactive for unrelated
    // reasons and this must not change mobile login behavior.
    if (profile.account_status === "inactive" && roles.some((r) => STAFF_ROLES.includes(r))) {
        console.warn("[auth] rejected: staff account inactive", { path: req.originalUrl, userId: profile.id });
        return next(forbidden("This account is awaiting activation by an administrator."));
    }

    req.user = {
        id: profile.id as string,
        email: (profile.email as string | null) ?? undefined,
        roles,
        capabilities: extractCapabilities(profile),
        accountStatus: profile.account_status,
        kycStatus: profile.kyc_status,
        isDeleted: false,
    };
    next();
}

type RoleJoinRow = { roles: { name: RoleName } | { name: RoleName }[] | null };

/**
 * PostgREST returns the nested relation as an object or an array depending on
 * how it infers cardinality, so both shapes are flattened here.
 */
function extractRoles(profile: unknown): RoleName[] {
    const rows = (profile as { user_roles?: RoleJoinRow[] }).user_roles ?? [];
    const names = rows.flatMap((row) => {
        if (!row.roles) return [];
        return Array.isArray(row.roles) ? row.roles.map((r) => r.name) : [row.roles.name];
    });
    return [...new Set(names)];
}

/**
 * Capabilities are read from the database on every request rather than from
 * the JWT's app_capabilities claim. The claim exists for the clients' benefit
 * (the admin console hides controls it cannot use), but a revoked capability
 * has to take effect immediately, not whenever the rider's token happens to
 * refresh — which for a KYC document viewer is the whole point.
 */
function extractCapabilities(profile: unknown): StaffCapability[] {
    const rows = (profile as { user_capabilities?: { capability: StaffCapability }[] })
        .user_capabilities ?? [];
    return [...new Set(rows.map((row) => row.capability))];
}
