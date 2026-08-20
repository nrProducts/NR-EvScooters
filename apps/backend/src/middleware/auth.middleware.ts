import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import {
    AuthContext,
    PermissionKey,
    UserRole,
    isStaffRole,
    permissionKey,
} from "../types";
import { unauthenticated, forbidden } from "../common/AppError";

export interface AuthedRequest extends Request {
    /**
     * Populated only by requireAuth, only from the verified access token.
     * Role and permissions are read from the database — never from the
     * request body, headers, or the token's own claims.
     */
    user?: AuthContext;
}

/**
 * Verifies the Supabase access token and resolves the caller's profile, role
 * and effective permissions.
 *
 * Two queries rather than one. The old version pulled roles and capabilities
 * through embedded joins in a single `users` select; the new schema puts
 * permissions in a view (`v_user_effective_permissions`) that PostgREST cannot
 * embed, because a view has no foreign key for it to follow. The second query
 * is skipped entirely for riders, who hold none — so the common case is still
 * one round trip against `users`.
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
        // Must stay a SINGLE STRING LITERAL — PostgREST infers the row type
        // from it, and concatenating widens the whole thing to `string`.
        //
        // `rider_profiles` is embedded rather than queried separately because
        // it is the only 1:1 child this path needs, and it is legitimately
        // absent for staff and admin accounts (see handle_new_auth_user);
        // an embed returns null there instead of erroring.
        .select("id, email, role, status, deleted_at, rider_profiles(kyc_status)")
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
    if (profile.status === "suspended") {
        console.warn("[auth] rejected: account suspended", { path: req.originalUrl, userId: profile.id });
        return next(forbidden("This account is suspended."));
    }

    const role = profile.role as UserRole;

    // A self-signed-up or newly-created staff/admin account starts inactive
    // until an admin activates it (see selfSignUpStaff() / AddStaffDialog).
    // Riders are never gated on this — they can be inactive for unrelated
    // reasons and this must not change mobile login behavior.
    if (profile.status === "inactive" && isStaffRole(role)) {
        console.warn("[auth] rejected: staff account inactive", { path: req.originalUrl, userId: profile.id });
        return next(forbidden("This account is awaiting activation by an administrator."));
    }

    let permissions: ReadonlySet<PermissionKey>;
    try {
        permissions = await loadPermissions(profile.id, role);
    } catch (err) {
        return next(err);
    }

    req.user = {
        id: profile.id,
        email: profile.email ?? undefined,
        role,
        permissions,
        status: profile.status,
        kycStatus: extractKycStatus(profile),
        isDeleted: false,
    };
    next();
}

/**
 * Effective permissions for one user, read fresh on every request.
 *
 * Not taken from the JWT. The token carries a permissions claim for the
 * clients' benefit — the console hides controls it cannot use — but a revoked
 * grant has to bite immediately rather than whenever the token next refreshes,
 * which for something like `kyc.reveal_number` is the entire point. This was
 * true of the old `user_capabilities` read and stays true here.
 *
 * The view already reconciles role grants against per-user overrides and
 * expands admins to the full catalogue, so there is nothing to merge in code.
 */
async function loadPermissions(
    userId: string,
    role: UserRole,
): Promise<ReadonlySet<PermissionKey>> {
    // Riders hold none, and the view says so — but skipping the query keeps
    // the hot path (every rider request) to a single round trip.
    if (!isStaffRole(role)) return new Set<PermissionKey>();

    const { data, error } = await supabaseAdmin
        .from("v_user_effective_permissions")
        .select("module_key, action")
        .eq("user_id", userId);
    if (error) throw error;

    const keys = (data ?? []).flatMap((row) =>
        row.module_key && row.action ? [permissionKey(row.module_key, row.action)] : [],
    );
    return new Set(keys);
}

/**
 * PostgREST returns an embedded 1:1 relation as an object or a one-element
 * array depending on how it infers cardinality, so both shapes are handled.
 * Absent (staff and admin accounts have no rider profile) means the account
 * has no KYC to speak of, which is `not_submitted`.
 */
function extractKycStatus(profile: {
    rider_profiles: { kyc_status: AuthContext["kycStatus"] } | { kyc_status: AuthContext["kycStatus"] }[] | null;
}): AuthContext["kycStatus"] {
    const rider = profile.rider_profiles;
    if (!rider) return "not_submitted";
    const row = Array.isArray(rider) ? rider[0] : rider;
    return row?.kyc_status ?? "not_submitted";
}
