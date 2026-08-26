import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./returns.controller";
import * as v from "./returns.validation";
import { damagePhotoUpload } from "../damages/damages.photo.upload";

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

// Admin Inspection — records damage, stages the late fee/other charges, and
// (only if they leave an additional amount due) raises the payable invoice
// and notifies the rider. Same authority as approve: this is what decides
// how much the rider owes, not merely a read.
router.post(
    "/:id/inspect",
    requireAction("returns", "approve"),
    validate({ params: v.rentalIdParam, body: v.saveInspectionBody }),
    asyncHandler(c.saveInspectionHandler),
);

// Adds one damage charge (with photos) immediately, ahead of the final
// inspection submit — see returns.controller.ts's addReturnDamageHandler.
router.post(
    "/:id/damage",
    requireAction("returns", "approve"),
    validate({ params: v.rentalIdParam }),
    damagePhotoUpload,
    asyncHandler(c.addReturnDamageHandler),
);

// Remove-only: waives a mistakenly-added damage charge.
router.post(
    "/:id/damage/:damageId/remove",
    requireAction("returns", "approve"),
    validate({ params: v.rentalDamageIdParam }),
    asyncHandler(c.removeReturnDamageHandler),
);

// Review Payment — amount, reference, date, status for the staged
// additional-amount-due invoice.
router.get(
    "/:id/payment",
    requireAction("returns", "approve"),
    validate({ params: v.rentalIdParam }),
    asyncHandler(c.getPaymentReviewHandler),
);

// The explicit admin confirmation that unlocks Approve Return once the
// invoice above is actually paid.
router.post(
    "/:id/verify-payment",
    requireAction("returns", "approve"),
    validate({ params: v.rentalIdParam }),
    asyncHandler(c.verifyReturnPaymentHandler),
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
