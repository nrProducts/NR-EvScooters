import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { getReportsSummaryHandler } from "./reports.controller";

/** Mounted at /api/v1/reports. */
const router = Router();
router.use(requireAuth, requireStaff);

router.get("/summary", asyncHandler(getReportsSummaryHandler));

export default router;
