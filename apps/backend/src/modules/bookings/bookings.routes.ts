import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireKycVerified, requireStaff } from "../../middleware/authorize.middleware";
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

// --- staff pickup/check-in ------------------------------------------------
router.get(
    "/",
    requireStaff,
    validate({ query: v.pickupQueueQuery }),
    asyncHandler(c.pickupQueueHandler),
);

router.get(
    "/:id/available-vehicles",
    requireStaff,
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.availableVehiclesHandler),
);

router.post(
    "/:id/pickup",
    requireStaff,
    validate({ params: v.bookingIdParam, body: v.confirmPickupBody }),
    asyncHandler(c.confirmPickupHandler),
);

export default router;
