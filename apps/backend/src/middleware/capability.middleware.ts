import { Response, NextFunction } from "express";
import { AuthedRequest } from "./auth.middleware";
import { StaffCapability } from "../types";
import { forbidden, unauthenticated } from "../common/AppError";

/**
 * Capabilities gate access to raw personal data (DPDPA s.8(5) — reasonable
 * security safeguards). They sit alongside roles, not inside them: an admin
 * does not automatically get kyc_reviewer, they get it because someone
 * granted it and the grant is in public.user_capabilities where it can be
 * audited and revoked.
 *
 * Deliberately mirrors requireRole in authorize.middleware.ts. Always compose
 * after requireAuth, and after requireStaff/requireAdmin where the route also
 * needs a role — capability answers "may you see it", not "should you be
 * anywhere near this endpoint".
 */
export const hasCapability = (req: AuthedRequest, cap: StaffCapability): boolean =>
    req.user?.capabilities.includes(cap) ?? false;

export const requireCapability =
    (cap: StaffCapability) => (req: AuthedRequest, _res: Response, next: NextFunction) => {
        if (!req.user) return next(unauthenticated());
        if (!hasCapability(req, cap)) {
            return next(
                forbidden(
                    `This action requires the "${cap}" capability. ` +
                    "Ask an administrator to grant it in Settings → Capabilities.",
                ),
            );
        }
        next();
    };

export const requireKycReviewer = requireCapability("kyc_reviewer");
export const requireRightsOfficer = requireCapability("rights_officer");
export const requirePiiExporter = requireCapability("pii_exporter");
