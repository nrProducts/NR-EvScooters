import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./invoices.controller";
import * as v from "./invoices.validation";

/** Admin console only, mounted at /api/v1/invoices. Riders see their own billing via /rentals/me/history. */
const router = Router();
router.use(requireAuth, requireStaff);

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
