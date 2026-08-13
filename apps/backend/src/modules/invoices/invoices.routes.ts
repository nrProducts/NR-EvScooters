import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireModule } from "../../middleware/authorize.middleware";
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
router.use(requireAuth, requireModule("payments"));

router.get(
    "/",
    validate({ query: v.listInvoicesQuery }),
    asyncHandler(c.listInvoicesHandler),
);

router.get(
    "/:id",
    validate({ params: v.uuidParam }),
    asyncHandler(c.getInvoiceHandler),
);

router.post(
    "/:id/refund",
    validate({ params: v.uuidParam, body: v.refundBody }),
    asyncHandler(c.refundInvoiceHandler),
);

export default router;
