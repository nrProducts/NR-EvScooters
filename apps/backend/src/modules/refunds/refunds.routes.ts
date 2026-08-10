import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./refunds.controller";
import * as v from "./refunds.validation";

/** Admin-only — deposit refunds are a staff/reconciliation concern, not a rider self-service action. */
const router = Router();
router.use(requireAuth, requireStaff);

router.get("/", validate({ query: v.listRefundsQuery }), asyncHandler(c.listRefundsHandler));
router.post("/", validate({ body: v.initiateRefundBody }), asyncHandler(c.createRefundHandler));
router.get("/:id", validate({ params: v.refundIdParam }), asyncHandler(c.getRefundHandler));
router.post("/:id/retry", validate({ params: v.refundIdParam }), asyncHandler(c.retryRefundHandler));

export default router;
