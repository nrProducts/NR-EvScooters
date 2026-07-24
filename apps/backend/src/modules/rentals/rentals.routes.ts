import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./rentals.controller";
import * as v from "./rentals.validation";

/** Rider-facing routes, mounted at /api/v1/rentals — req.user.id only. */
const router = Router();
router.use(requireAuth);

router.get("/me/current", asyncHandler(c.myCurrentRentalHandler));
router.get(
    "/me/history",
    validate({ query: v.rentalHistoryQuery }),
    asyncHandler(c.myRentalHistoryHandler),
);

export default router;
