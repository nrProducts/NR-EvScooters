import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { assignVehicleHandler } from "./vehicles.controller";

const router = Router();
router.post("/:id/assign", requireAuth, asyncHandler(assignVehicleHandler));

export default router;