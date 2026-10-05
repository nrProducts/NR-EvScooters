import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireKycVerified } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./payments.controller";
import * as v from "./payments.validation";

const router = Router();

// Razorpay calls this directly — no bearer token, so it must be mounted
// BEFORE requireAuth below. Protected by webhook signature verification
// inside the handler instead.
router.post("/webhook", asyncHandler(c.webhookHandler));

router.use(requireAuth);

// Read-only price preview. Creates nothing, so it is safe to call from a
// screen the rider may abandon — and it is what lets the review screen show
// the discount BEFORE Checkout opens rather than after.
router.get(
    "/plans/:planId/quote",
    validate({ params: v.quotePlanParams, query: v.quotePlanQuery }),
    asyncHandler(c.quotePlanHandler),
);

// Pay-first rider checkout. Declared before "/bookings/:id/order" so "order"
// is never captured as a booking id. Creates a payment_orders "booking intent"
// row only — the booking is materialised when this order's payment captures
// (payments.service.ts materializeBookingFromOrder).
router.post(
    "/bookings/order",
    requireKycVerified,
    validate({ body: v.createBookingOrderBody }),
    asyncHandler(c.createBookingOrderHandler),
);

// Legacy invoice-tied path — now only reachable for an admin-created
// `pending_payment` booking that a rider (or admin) pays later.
router.post(
    "/bookings/:id/order",
    requireKycVerified,
    validate({ params: v.bookingIdParam }),
    asyncHandler(c.createOrderForBookingHandler),
);

router.post(
    "/invoices/:id/order",
    validate({ params: v.invoiceIdParam }),
    asyncHandler(c.createOrderForInvoiceHandler),
);

router.post(
    "/verify",
    validate({ body: v.verifyPaymentBody }),
    asyncHandler(c.verifyPaymentHandler),
);

export default router;
