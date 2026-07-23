import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./rentals.controller";

/** Rider-facing routes, mounted at /api/v1/rentals — req.user.id only. */
const router = Router();
router.use(requireAuth);

router.get("/me/current", asyncHandler(c.myCurrentRentalHandler));

export default router;
