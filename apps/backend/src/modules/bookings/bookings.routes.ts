import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireKycVerified } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./bookings.controller";
import * as v from "./bookings.validation";

const router = Router();

router.use(requireAuth);

// Declared before any future "/:id" route so a static path is never
// swallowed as a param — same care already taken for GET /users/me and
// GET /vehicle-models/featured.
router.get("/me/current", asyncHandler(c.myCurrentBookingHandler));

router.post(
    "/",
    requireKycVerified,
    validate({ body: v.createBookingBody }),
    asyncHandler(c.createBookingHandler),
);

export default router;
