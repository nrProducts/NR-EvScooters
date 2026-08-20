import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./returns.controller";
import * as v from "./returns.validation";

/**
 * Staff/admin-only — reviewing and settling a return has no rider
 * self-service counterpart.
 *
 * Per-route actions rather than one `requireModule("returns")` on the router.
 * Under the coarse gate, `returns.view` alone authorised POST
 * /returns/:id/approve — which releases the deposit, raises the settlement
 * invoice and initiates the refund. Reading the settlement queue and deciding
 * one are different authorities, and the catalogue already had separate rows
 * for them.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/settlements",
    requireAction("returns", "view"),
    validate({ query: v.listSettlementsQuery }),
    asyncHandler(c.listSettlementsHandler),
);

router.get(
    "/:id",
    requireAction("returns", "view"),
    validate({ params: v.rentalIdParam }),
    asyncHandler(c.getReturnDetailHandler),
);

// Settles the deposit against late fees and damages, then refunds or invoices
// the difference. `returns.approve`, never `returns.view`.
router.post(
    "/:id/approve",
    requireAction("returns", "approve"),
    validate({ params: v.rentalIdParam, body: v.approveReturnSettlementBody }),
    asyncHandler(c.approveReturnSettlementHandler),
);

export default router;
