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
