import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth.middleware";
import { RoleName, STAFF_ROLES, ModuleKey } from "../types";
import { forbidden, unauthenticated } from "../common/AppError";
import { supabaseAdmin } from "../config/supabase";

export const hasRole = (req: AuthedRequest, role: RoleName): boolean =>
    req.user?.roles.includes(role) ?? false;

export const hasAnyRole = (req: AuthedRequest, roles: readonly RoleName[]): boolean =>
    req.user?.roles.some((r) => roles.includes(r)) ?? false;

export const isAdmin = (req: AuthedRequest): boolean => hasRole(req, "admin");
export const isStaff = (req: AuthedRequest): boolean => hasAnyRole(req, STAFF_ROLES);

/** Caller must hold exactly this role. Use after requireAuth. */
export const requireRole =
    (role: RoleName) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        if (!hasRole(req, role)) return next(forbidden(`This action requires the ${role} role.`));
        next();
    };

/** Caller must hold at least one of these roles. */
export const requireAnyRole =
    (...roles: RoleName[]) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        if (!hasAnyRole(req, roles)) {
            return next(forbidden(`This action requires one of: ${roles.join(", ")}.`));
        }
        next();
    };

export const requireAdmin = requireRole("admin");
export const requireStaff = requireAnyRole(...STAFF_ROLES);

/**
 * Pure decision core for module-level access, split out from hasModule() so
 * it's unit-testable without a database — same reasoning as
 * auth.service.ts's deriveSessionFlags(). Admin is always unconditional;
 * everyone else needs an explicit grant row (hasGrant), and only staff-role
 * accounts can hold one at all.
 */
export const resolveModuleAccess = (
    roles: readonly RoleName[],
    hasGrant: boolean,
): boolean => {
    if (roles.includes("admin")) return true;
    if (!roles.some((r) => STAFF_ROLES.includes(r))) return false;
    return hasGrant;
};

/** Per-user, per-module grant check — see public.staff_permissions. */
export const hasModule = async (req: AuthedRequest, moduleKey: ModuleKey): Promise<boolean> => {
    if (!req.user) return false;
    if (req.user.roles.includes("admin")) return true;
    if (!isStaff(req)) return false;

    const { data, error } = await supabaseAdmin
        .from("staff_permissions")
        .select("module_key")
        .eq("user_id", req.user.id)
        .eq("module_key", moduleKey)
        .maybeSingle();
    if (error) throw error;

    return resolveModuleAccess(req.user.roles, !!data);
};

/** Caller must be admin, or staff with this module explicitly granted. Use after requireAuth. */
export const requireModule =
    (moduleKey: ModuleKey) => async (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        try {
            if (!(await hasModule(req, moduleKey))) {
                return next(forbidden(`This action requires the "${moduleKey}" module permission.`));
            }
            next();
        } catch (err) {
            next(err);
        }
    };

/**
 * Not attached to any route yet — scaffolded now so the future booking
 * endpoint (POST /vehicle-models/:id/bookings) is a one-line addition:
 * requireAuth, requireKycVerified, then the handler.
 */
export const requireKycVerified = (req: AuthedRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthenticated());
    if (req.user.kycStatus !== "verified") {
        return next(forbidden("Complete KYC verification before booking a scooter."));
    }
    next();
};

/**
 * Allows the resource owner through, or any staff member. `paramName` is the
 * route param holding the target user id; the literal "me" resolves to self.
 */
export const requireSelfOrStaff =
    (paramName = "id") => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        const target = req.params[paramName];
        if (target === "me" || target === req.user.id || isStaff(req)) return next();
        next(forbidden("You may only access your own record."));
    };

/** Resolves the "me" alias to the caller's own id. */
export const resolveTargetUserId = (req: AuthedRequest, paramName = "id"): string => {
    const raw = req.params[paramName];
    return raw === "me" ? req.user!.id : (raw as string);
};
