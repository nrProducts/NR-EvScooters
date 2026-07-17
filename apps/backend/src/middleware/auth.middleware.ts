import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../config/supabase";
import { AuthContext, RoleName } from "../types";
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
    if (!token) return next(unauthenticated("Missing access token."));

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return next(unauthenticated("Invalid or expired access token."));

    const { data: profile, error: profileError } = await supabaseAdmin
        .from("users")
        .select("id, email, account_status, kyc_status, deleted_at, user_roles(roles(name))")
        .eq("id", data.user.id)
        .maybeSingle();

    if (profileError) return next(profileError);
    if (!profile) return next(unauthenticated("No profile exists for this account."));

    // A soft-deleted account must not authenticate as an active rider (§15).
    if (profile.deleted_at) return next(forbidden("This account has been deactivated."));
    if (profile.account_status === "suspended") {
        return next(forbidden("This account is suspended."));
    }

    req.user = {
        id: profile.id as string,
        email: (profile.email as string | null) ?? undefined,
        roles: extractRoles(profile),
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
