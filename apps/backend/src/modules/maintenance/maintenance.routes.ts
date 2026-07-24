import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./maintenance.controller";

/** Rider-facing routes, mounted at /api/v1/maintenance — req.user.id only. */
const router = Router();
router.use(requireAuth);

router.get("/me/history", asyncHandler(c.myMaintenanceHistoryHandler));

export default router;
