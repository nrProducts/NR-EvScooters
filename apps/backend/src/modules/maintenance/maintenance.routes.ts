import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./maintenance.controller";
import * as v from "./maintenance.validation";

/** Mounted at /api/v1/maintenance. Rider routes work off req.user.id; admin routes are fleet-wide. */
const router = Router();
router.use(requireAuth);

router.get("/me/history", asyncHandler(c.myMaintenanceHistoryHandler));

router.get(
    "/",
    requireStaff,
    validate({ query: v.listMaintenanceQuery }),
    asyncHandler(c.listMaintenanceHandler),
);

router.post(
    "/",
    requireStaff,
    validate({ body: v.createMaintenanceBody }),
    asyncHandler(c.createMaintenanceHandler),
);

router.patch(
    "/:id",
    requireStaff,
    validate({ params: v.uuidParam, body: v.updateMaintenanceBody }),
    asyncHandler(c.updateMaintenanceHandler),
);

export default router;
