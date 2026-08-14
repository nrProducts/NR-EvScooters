import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { getReportsSummaryHandler } from "./reports.controller";

/** Mounted at /api/v1/reports. */
const router = Router();
router.use(requireAuth);

// requireAction("dashboard","view") replaces the old bare requireStaff check:
// hasAction()/resolveModuleAccess() already admit admin unconditionally and
// otherwise require an isStaff role plus the module-action grant, so stacking
// requireStaff on top would just be a redundant extra DB round-trip.
router.get("/summary", requireAction("dashboard", "view"), asyncHandler(getReportsSummaryHandler));

export default router;
