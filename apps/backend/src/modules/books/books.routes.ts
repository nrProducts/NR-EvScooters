import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./books.controller";
import * as v from "./books.validation";

/**
 * The books (Stage 6). Read-only: every figure is derived from
 * v_ledger_postings, so `books.view` is the only permission — the auditor
 * profile holds it too.
 */
const router = Router();
router.use(requireAuth);
router.use(requireAction("books", "view"));

router.get("/trial-balance", validate({ query: v.rangeQuery }), asyncHandler(c.trialBalanceHandler));
router.get("/profit-and-loss", validate({ query: v.rangeQuery }), asyncHandler(c.profitAndLossHandler));
router.get("/deposits", asyncHandler(c.depositRegisterHandler));
router.get("/receivables", asyncHandler(c.receivablesHandler));
router.get("/advance-tax", asyncHandler(c.advanceTaxHandler));
router.get("/unbalanced", asyncHandler(c.unbalancedHandler));
router.get("/export/tally.xml", validate({ query: v.rangeQuery }), asyncHandler(c.tallyExportHandler));
router.get("/export/books.xlsx", validate({ query: v.rangeQuery }), asyncHandler(c.booksXlsxHandler));

export default router;
