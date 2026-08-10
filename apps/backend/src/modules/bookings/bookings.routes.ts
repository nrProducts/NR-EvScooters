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
router.get(
    "/me/history",
    validate({ query: v.bookingHistoryQuery }),
    asyncHandler(c.myBookingHistoryHandler),
);
// Unlike /me/current (pending_payment/confirmed only), this also serves a
// 'fulfilled' booking — the Billing screen's only way to read plan_status/
// next_due_at once the rider has been picked up and is riding.
router.get(
    "/me/:id",
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.myBookingByIdHandler),
);

router.post(
    "/",
    requireKycVerified,
    validate({ body: v.createBookingBody }),
    asyncHandler(c.createBookingHandler),
);

// Rider-initiated pre-pickup cancellation, scoped to the caller's own booking
// inside the service. Distinct from POST /:id/reject, which is staff-only and
// refuses anything past 'pending_payment'. Deliberately NOT requireKycVerified:
// a rider whose KYC lapsed must still be able to cancel.
router.post(
    "/:id/cancel",
    validate({ params: v.bookingIdParam, body: v.cancelBookingBody }),
    asyncHandler(c.cancelMyBookingHandler),
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

router.get(
    "/:id",
    requireStaff,
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.getBookingHandler),
);

router.post(
    "/:id/pickup",
    requireStaff,
    validate({ params: v.bookingIdParam, body: v.confirmPickupBody }),
    asyncHandler(c.confirmPickupHandler),
);

// Staff-initiated cancellation of a pending_payment/confirmed booking — e.g.
// releasing a vehicle a booking is holding without the rider having cancelled
// it themselves. See adminCancelBooking's comment for why this exists.
router.post(
    "/:id/admin-cancel",
    requireStaff,
    validate({ params: v.bookingIdParam, body: v.rejectBookingBody }),
    asyncHandler(c.adminCancelBookingHandler),
);

export default router;
