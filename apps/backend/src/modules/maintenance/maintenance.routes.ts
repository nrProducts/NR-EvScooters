import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./maintenance.controller";
import * as v from "./maintenance.validation";

/** Mounted at /api/v1/maintenance. Rider routes work off req.user.id; admin routes are fleet-wide. */
const router = Router();
router.use(requireAuth);

router.get(
    "/me/history",
    validate({ query: v.myMaintenanceHistoryQuery }),
    asyncHandler(c.myMaintenanceHistoryHandler),
);
router.get("/me/notice", asyncHandler(c.myMaintenanceNoticeHandler));

router.get(
    "/",
    requireAction("maintenance", "view"),
    validate({ query: v.listMaintenanceQuery }),
    asyncHandler(c.listMaintenanceHandler),
);

router.post(
    "/",
    requireAction("maintenance", "create"),
    validate({ body: v.createMaintenanceBody }),
    asyncHandler(c.createMaintenanceHandler),
);

router.patch(
    "/:id",
    requireAction("maintenance", "edit"),
    validate({ params: v.uuidParam, body: v.updateMaintenanceBody }),
    asyncHandler(c.updateMaintenanceHandler),
);

router.post(
    "/:id/quick-fix",
    requireAction("maintenance", "complete"),
    validate({ params: v.uuidParam, body: v.quickFixBody }),
    asyncHandler(c.quickFixHandler),
);

router.post(
    "/:id/temp-vehicle",
    requireAction("maintenance", "edit"),
    validate({ params: v.uuidParam, body: v.tempVehicleBody }),
    asyncHandler(c.assignTempVehicleHandler),
);

router.post(
    "/:id/not-repairable",
    requireAction("maintenance", "edit"),
    validate({ params: v.uuidParam, body: v.notRepairableBody }),
    asyncHandler(c.notRepairableHandler),
);

router.post(
    "/:id/reassign",
    requireAction("maintenance", "edit"),
    validate({ params: v.uuidParam, body: v.reassignBody }),
    asyncHandler(c.reassignHandler),
);

export default router;
