import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./billing-cycle.controller";
import * as v from "./billing-cycle.validation";

/**
 * Admin-only. Re-dating a rider's billing cycle gives away days and moves a
 * return deadline — a policy decision, not a delegable staff action, same as
 * the late-fee and recovery settings.
 */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/settings", asyncHandler(c.getSettingsHandler));
router.put("/settings", validate({ body: v.updateBillingCycleSettingsBody }), asyncHandler(c.updateSettingsHandler));

// Preview is a POST (it takes a body) but never writes.
router.post(
    "/bookings/:id/preview",
    validate({ params: v.billingCycleBookingParam, body: v.previewBillingCycleBody }),
    asyncHandler(c.previewChangeHandler),
);
router.post(
    "/bookings/:id",
    validate({ params: v.billingCycleBookingParam, body: v.applyBillingCycleBody }),
    asyncHandler(c.applyChangeHandler),
);

export default router;
