import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./consent.controller";
import * as v from "./consent.validation";

/** Rider-facing consent routes, mounted at /api/v1/users/me/consents. */
export const riderConsentRouter = Router();
riderConsentRouter.use(requireAuth);

riderConsentRouter.get("/", asyncHandler(c.getMyConsentsHandler));

riderConsentRouter.get("/history", asyncHandler(c.getMyConsentHistoryHandler));

riderConsentRouter.post(
    "/",
    validate({ body: v.recordConsentBody }),
    asyncHandler(c.recordMyConsentsHandler),
);

// Withdrawal must be exactly as easy as granting (DPDPA s.6(4)) — one call,
// no ticket, no support queue.
riderConsentRouter.delete(
    "/:purpose",
    validate({ params: v.purposeParam }),
    asyncHandler(c.withdrawMyConsentHandler),
);

/**
 * Notice + admin routes, mounted at /api/v1/consent.
 *
 * The notice itself is readable by any signed-in user, including riders — a
 * rider who cannot re-read what they agreed to has not really been informed.
 * Only the per-user lookups and publishing are privileged.
 */
export const consentRouter = Router();
consentRouter.use(requireAuth);

consentRouter.get(
    "/notice",
    validate({ query: v.noticeQuery }),
    asyncHandler(c.getNoticeHandler),
);

consentRouter.get("/notices", requireAdmin, asyncHandler(c.listNoticesHandler));

consentRouter.post(
    "/notices",
    requireAdmin,
    validate({ body: v.publishNoticeBody }),
    asyncHandler(c.publishNoticeHandler),
);

// Reading someone else's consent record is a read of their personal data, so
// it is logged to pii_access_log by the controller in Phase 3.
consentRouter.get(
    "/users/:userId",
    requireStaff,
    validate({ params: v.userIdParam }),
    asyncHandler(c.getUserConsentsHandler),
);
