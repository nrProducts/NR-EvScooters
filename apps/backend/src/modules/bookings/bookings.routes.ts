import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireKycVerified } from "../../middleware/authorize.middleware";
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

// Rider-initiated early payment for the upcoming period — opens on the last
// day of the current one (next_due_at <= today), before the overdue-sweep
// would otherwise lock the vehicle the following day. Scoped to the
// caller's own booking inside the service, same as /:id/cancel above.
router.post(
    "/me/:id/recharge",
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.requestEarlyRechargeHandler),
);

// --- staff pickup/check-in ------------------------------------------------
router.get(
    "/",
    requireAction("bookings", "view"),
    validate({ query: v.pickupQueueQuery }),
    asyncHandler(c.pickupQueueHandler),
);

// Staff creates a booking for a rider, optionally recording an offline
// payment (cash/UPI/…) in the same request.
router.post(
    "/admin-create",
    requireAction("bookings", "edit"),
    validate({ body: v.adminCreateBookingBody }),
    asyncHandler(c.adminCreateBookingHandler),
);

router.get(
    "/:id/available-vehicles",
    requireAction("bookings", "view"),
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.availableVehiclesHandler),
);

router.get(
    "/:id",
    requireAction("bookings", "view"),
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.getBookingHandler),
);

router.post(
    "/:id/pickup",
    requireAction("bookings", "edit"),
    validate({ params: v.bookingIdParam, body: v.confirmPickupBody }),
    asyncHandler(c.confirmPickupHandler),
);

// Staff-initiated cancellation of a pending_payment/confirmed booking — e.g.
// releasing a vehicle a booking is holding without the rider having cancelled
// it themselves. See adminCancelBooking's comment for why this exists.
router.post(
    "/:id/admin-cancel",
    requireAction("bookings", "cancel"),
    validate({ params: v.bookingIdParam, body: v.rejectBookingBody }),
    asyncHandler(c.adminCancelBookingHandler),
);

// Admin per-rider override for the late renewal fee — wins over the global
// plan_renewal_settings amount whenever this booking's renewal is late.
router.patch(
    "/:id/late-fee-override",
    requireAction("bookings", "edit"),
    validate({ params: v.bookingIdParam, body: v.lateFeeOverrideBody }),
    asyncHandler(c.setLateFeeOverrideHandler),
);

export default router;
