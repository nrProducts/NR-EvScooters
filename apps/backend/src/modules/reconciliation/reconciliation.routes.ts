import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./reconciliation.controller";
import * as v from "./reconciliation.validation";
import { bankStatementUpload } from "./bank.upload";

/**
 * Mounted at /api/v1/reconciliation.
 *
 * `reconciliation.view` reads; `reconciliation.resolve` changes something —
 * resolves an exception, recovers a missed payment, runs a Razorpay sync or
 * (Stage 3) imports and categorises a bank statement.
 */
const router = Router();
router.use(requireAuth);

// The original live comparison against Razorpay's payment list.
router.get(
    "/",
    requireAction("reconciliation", "view"),
    validate({ query: v.reconciliationQuery }),
    asyncHandler(c.getReconciliationHandler),
);

// --- Stage 2: Razorpay settlements --------------------------------------------
router.get("/statements", requireAction("reconciliation", "view"), validate({ query: v.listStatementsQuery }), asyncHandler(c.listStatementsHandler));
router.get("/statements/:id", requireAction("reconciliation", "view"), validate({ params: v.idParam }), asyncHandler(c.getStatementHandler));
router.get("/settlements/summary", requireAction("reconciliation", "view"), validate({ query: v.monthQuery }), asyncHandler(c.settlementSummaryHandler));
router.get("/settlements/export", requireAction("reconciliation", "view"), validate({ query: v.monthQuery }), asyncHandler(c.settlementExportHandler));
router.post("/settlements/sync", requireAction("reconciliation", "resolve"), validate({ body: v.syncBody }), asyncHandler(c.syncSettlementsHandler));

// --- Stage 3: HDFC statement import, categories, cash book, tie-out --------------
router.post("/bank/preview", requireAction("reconciliation", "resolve"), bankStatementUpload, asyncHandler(c.previewBankHandler));
router.post("/bank/import", requireAction("reconciliation", "resolve"), bankStatementUpload, asyncHandler(c.importBankHandler));
router.get("/bank/lines", requireAction("reconciliation", "view"), validate({ query: v.bankLinesQuery }), asyncHandler(c.listBankLinesHandler));
router.post("/bank/lines/:id/category", requireAction("reconciliation", "resolve"), validate({ params: v.idParam, body: v.categoriseBody }), asyncHandler(c.categoriseLineHandler));
router.post("/bank/rematch", requireAction("reconciliation", "resolve"), asyncHandler(c.rematchBankHandler));
router.get("/cash-book", requireAction("reconciliation", "view"), validate({ query: v.monthQuery }), asyncHandler(c.cashBookHandler));
router.get("/tie-out", requireAction("reconciliation", "view"), validate({ query: v.monthQuery }), asyncHandler(c.tieOutHandler));

// --- exceptions (both sources) ---------------------------------------------------
router.get("/exceptions", requireAction("reconciliation", "view"), validate({ query: v.listExceptionsQuery }), asyncHandler(c.listExceptionsHandler));
router.post("/exceptions/:id/resolve", requireAction("reconciliation", "resolve"), validate({ params: v.idParam, body: v.resolveExceptionBody }), asyncHandler(c.resolveExceptionHandler));
router.post("/exceptions/:id/recover-payment", requireAction("reconciliation", "resolve"), validate({ params: v.idParam }), asyncHandler(c.recoverPaymentHandler));

export default router;
