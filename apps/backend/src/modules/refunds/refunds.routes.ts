import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./refunds.controller";
import * as v from "./refunds.validation";

/**
 * Deposit and cancellation refunds. Staff-delegable, not admin-only.
 *
 * The docstring here used to say "Admin-only", and the console's nav entry
 * agrees with that by listing Refunds as `roles: ["admin"]`. Neither was true:
 * the router was gated by `requireModule("refunds")`, which any staff account
 * holding *any* refunds permission passes. What actually kept staff out was
 * that nobody granted the permission — a convention, not a control.
 *
 * Resolved in favour of delegable, because that is what the permission
 * catalogue is for: `refunds.view` and `refunds.approve` exist as separate
 * rows precisely so the two can be handed out separately. Making the router
 * admin-only would leave both rows meaningless.
 *
 * Which makes the per-route split below the load-bearing part.
 * `requireModule` is the COARSE gate — "does the caller hold any permission in
 * this module" — so under it `refunds.view` alone authorised initiating a
 * refund and retrying one. An administrator granting "Refunds — view" was
 * told they were giving read access and was in fact giving the ability to
 * move money out of the business.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("refunds", "view"),
    validate({ query: v.listRefundsQuery }),
    asyncHandler(c.listRefundsHandler),
);

// Money leaves the business here — `refunds.approve`, never `refunds.view`.
router.post(
    "/",
    requireAction("refunds", "approve"),
    validate({ body: v.initiateRefundBody }),
    asyncHandler(c.createRefundHandler),
);

router.get(
    "/:id",
    requireAction("refunds", "view"),
    validate({ params: v.refundIdParam }),
    asyncHandler(c.getRefundHandler),
);

router.get(
    "/:id/settlement",
    requireAction("refunds", "view"),
    validate({ params: v.refundIdParam }),
    asyncHandler(c.getRefundSettlementHandler),
);

// Review — adjust deductions and mark reviewed. The money-decision gate is
// `refunds.approve`, same as approval itself.
router.post(
    "/:id/review",
    requireAction("refunds", "approve"),
    validate({ params: v.refundIdParam, body: v.reviewRefundBody }),
    asyncHandler(c.reviewRefundHandler),
);

router.post(
    "/:id/reject",
    requireAction("refunds", "approve"),
    validate({ params: v.refundIdParam, body: v.rejectRefundBody }),
    asyncHandler(c.rejectRefundHandler),
);

// A retry re-attempts a gateway payout. Same authority as initiating one.
router.post(
    "/:id/retry",
    requireAction("refunds", "approve"),
    validate({ params: v.refundIdParam }),
    asyncHandler(c.retryRefundHandler),
);

export default router;
