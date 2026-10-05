import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./invoices.controller";
import * as v from "./invoices.validation";

/** Rider's own payment history/receipts — mounted at /invoices/me, before the admin router below. */
export const riderRouter = Router();
riderRouter.use(requireAuth);
riderRouter.get("/", validate({ query: v.myInvoicesQuery }), asyncHandler(c.myInvoicesHandler));

/** Admin console only, mounted at /api/v1/invoices. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("payments", "view"),
    validate({ query: v.listInvoicesQuery }),
    asyncHandler(c.listInvoicesHandler),
);

router.get(
    "/:id",
    requireAction("payments", "view"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.getInvoiceHandler),
);

router.post(
    "/:id/refund",
    requireAction("payments", "refund"),
    validate({ params: v.uuidParam, body: v.refundBody }),
    asyncHandler(c.refundInvoiceHandler),
);

// Record an offline payment (cash/UPI/…) against an unpaid invoice — the
// hub-side counterpart to a rider paying in-app. Same "trusted with money"
// gate as issuing a refund.
router.post(
    "/:id/record-payment",
    requireAction("payments", "refund"),
    validate({ params: v.uuidParam, body: v.recordPaymentBody }),
    asyncHandler(c.recordInvoicePaymentHandler),
);

// One-off admin charge against a rider (lost key, cleaning fee, fine, …).
router.post(
    "/adhoc",
    requireAction("payments", "refund"),
    validate({ body: v.adhocChargeBody }),
    asyncHandler(c.adhocChargeHandler),
);

export default router;
