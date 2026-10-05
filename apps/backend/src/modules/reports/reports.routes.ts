import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { getPendingApprovalsHandler, getReportsSummaryHandler } from "./reports.controller";

/** Mounted at /api/v1/reports. */
const router = Router();
router.use(requireAuth);

// requireAction("dashboard","view") replaces the old bare requireStaff check:
// hasAction()/resolveModuleAccess() already admit admin unconditionally and
// otherwise require an isStaff role plus the module-action grant, so stacking
// requireStaff on top would just be a redundant extra DB round-trip.
router.get("/summary", requireAction("dashboard", "view"), asyncHandler(getReportsSummaryHandler));

// No module-action gate — this is just aggregate counts (no row data) spanning
// six different modules' own permissions, fetched by the header widget on
// every admin screen. Any authenticated staff/admin session can see it, same
// as the notification bell needs no per-module grant either.
router.get("/pending-approvals", asyncHandler(getPendingApprovalsHandler));

export default router;
