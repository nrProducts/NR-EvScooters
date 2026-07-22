import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth.middleware";
import { RoleName, STAFF_ROLES } from "../types";
import { forbidden, unauthenticated } from "../common/AppError";

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
