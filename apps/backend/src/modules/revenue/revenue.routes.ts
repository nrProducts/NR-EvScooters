import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./revenue.controller";
import * as v from "./revenue.validation";

/**
 * Mounted at /api/v1/revenue. Every figure the dashboard Revenue Overview and
 * the Revenue screen show is a projection of one engine (revenue.service.ts),
 * so the two can never disagree.
 *
 * Gated the same as /reports/summary — `dashboard.view`. Anyone who can see the
 * dashboard revenue cards can open the detailed screen.
 */
const router = Router();
router.use(requireAuth);
router.use(requireAction("dashboard", "view"));

router.get("/summary", validate({ query: v.revenueSummaryQuery }), asyncHandler(c.revenueSummaryHandler));
router.get("/trend", validate({ query: v.revenueTrendQuery }), asyncHandler(c.revenueTrendHandler));
router.get("/by-type", validate({ query: v.revenueRangeQuery }), asyncHandler(c.revenueByTypeHandler));
router.get("/by-method", validate({ query: v.revenueRangeQuery }), asyncHandler(c.revenueByMethodHandler));
router.get("/refunds", validate({ query: v.revenueRangeQuery }), asyncHandler(c.revenueRefundsHandler));
router.get("/deposits", validate({ query: v.revenueRangeQuery }), asyncHandler(c.revenueDepositsHandler));
router.get("/transactions", validate({ query: v.revenueTransactionsQuery }), asyncHandler(c.revenueTransactionsHandler));
router.get("/export", validate({ query: v.revenueExportQuery }), asyncHandler(c.revenueExportHandler));

export default router;
