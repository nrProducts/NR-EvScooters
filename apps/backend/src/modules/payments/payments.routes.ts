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
