import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth.middleware";
import {
    ModuleKey,
    PermissionAction,
    STAFF_ROLES,
    UserRole,
    hasModuleAccess,
    hasPermission,
    isStaffRole,
} from "../types";
import { forbidden, unauthenticated } from "../common/AppError";

export const hasRole = (req: AuthedRequest, role: UserRole): boolean =>
    req.user?.role === role;

export const hasAnyRole = (req: AuthedRequest, roles: readonly UserRole[]): boolean =>
    req.user ? roles.includes(req.user.role) : false;

export const isAdmin = (req: AuthedRequest): boolean => hasRole(req, "admin");
export const isStaff = (req: AuthedRequest): boolean =>
    req.user ? isStaffRole(req.user.role) : false;

/** Caller must hold exactly this role. Use after requireAuth. */
export const requireRole =
    (role: UserRole) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        if (!hasRole(req, role)) return next(forbidden(`This action requires the ${role} role.`));
        next();
    };

/** Caller must hold at least one of these roles. */
export const requireAnyRole =
    (...roles: UserRole[]) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        if (!hasAnyRole(req, roles)) {
            return next(forbidden(`This action requires one of: ${roles.join(", ")}.`));
        }
        next();
    };

export const requireAdmin = requireRole("admin");
export const requireStaff = requireAnyRole(...STAFF_ROLES);

/**
 * Pure decision core, split out so it is unit-testable without a database —
 * same reasoning as auth.service.ts's deriveSessionFlags().
 *
 * The admin short-circuit is kept even though `v_user_effective_permissions`
 * already expands admins to the whole catalogue. Belt and braces: an admin
 * must never be locked out of the console by a permission row that someone
 * forgot to seed.
 */
export const resolveAccess = (role: UserRole, hasGrant: boolean): boolean => {
    if (role === "admin") return true;
    if (!isStaffRole(role)) return false;
    return hasGrant;
};

/**
 * Coarse gate: does the caller hold *any* permission within the module?
 *
 * No longer touches the database. Permissions come from the set requireAuth
 * resolved for this request, so what used to be one query per guarded route —
 * several per page load in the console — is now a prefix scan over a Set.
 *
 * Still async: the signature is awaited from dozens of call sites, and the
 * cost of keeping the promise is nil next to the churn of changing them all.
 */
export const hasModule = async (
    req: AuthedRequest,
    moduleKey: ModuleKey,
): Promise<boolean> => {
    if (!req.user) return false;
    return resolveAccess(req.user.role, hasModuleAccess(req.user, moduleKey));
};

/** Caller must be admin, or hold some permission in this module. Use after requireAuth. */
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
 * Fine gate: the specific `<module>.<action>` grant.
 *
 * This is now the *only* authorisation primitive below role. What used to be
 * a separate capability layer — `kyc_reviewer`, `rights_officer`,
 * `pii_exporter` in their own table with their own middleware — are ordinary
 * permissions here: `kyc.reveal_number`, `privacy.process`, `privacy.export`.
 */
export const hasAction = async (
    req: AuthedRequest,
    moduleKey: ModuleKey,
    action: PermissionAction,
): Promise<boolean> => {
    if (!req.user) return false;
    return resolveAccess(req.user.role, hasPermission(req.user, moduleKey, action));
};

/**
 * Caller must be admin, or hold this specific module+action grant. Use in
 * place of requireModule() wherever a route needs to distinguish (e.g. view
 * vs edit) rather than just "can this section be opened at all".
 */
export const requireAction =
    (moduleKey: ModuleKey, action: PermissionAction) =>
    async (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        try {
            if (!(await hasAction(req, moduleKey, action))) {
                return next(forbidden(`This action requires the "${moduleKey}.${action}" permission.`));
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
