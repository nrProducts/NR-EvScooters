import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./billing.controller";
import * as v from "./billing.validation";

/**
 * Billing & Charges console — configurable charge/discount rules and the
 * adjustments they materialise onto a rider's periods.
 *
 * Staff-delegable, not admin-only. The docstring here used to claim
 * admin-only while every route was gated by an ordinary `billing.*`
 * permission that any staff account can be granted, and the console's nav
 * entry said `roles: ["admin"]` — frontend hiding standing in for a control
 * that was never there. Resolved in favour of delegable, matching the
 * catalogue, which has separate `view` / `create` / `edit` / `waive` rows
 * precisely so they can be handed out separately.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/charge-rules",
    requireAction("billing", "view"),
    validate({ query: v.listChargeRulesQuery }),
    asyncHandler(c.listChargeRulesHandler),
);
router.post(
    "/charge-rules",
    requireAction("billing", "create"),
    validate({ body: v.createChargeRuleBody }),
    asyncHandler(c.createChargeRuleHandler),
);
router.get(
    "/charge-rules/:id",
    requireAction("billing", "view"),
    validate({ params: v.chargeRuleIdParam }),
    asyncHandler(c.getChargeRuleHandler),
);
router.patch(
    "/charge-rules/:id",
    requireAction("billing", "edit"),
    validate({ params: v.chargeRuleIdParam, body: v.updateChargeRuleBody }),
    asyncHandler(c.updateChargeRuleHandler),
);

router.get(
    "/rider-charges",
    requireAction("billing", "view"),
    validate({ query: v.listRiderChargesQuery }),
    asyncHandler(c.listRiderChargesHandler),
);
// Waiving a charge forgives money the rider owes. `billing.waive` exists in
// the catalogue for exactly this and nothing was checking it — the route used
// `billing.edit`, so anyone who could author a rule could also cancel a debt.
router.post(
    "/rider-charges/:id/waive",
    requireAction("billing", "waive"),
    validate({ params: v.riderChargeIdParam, body: v.waiveRiderChargeBody }),
    asyncHandler(c.waiveRiderChargeHandler),
);

router.get(
    "/discount-rules",
    requireAction("billing", "view"),
    validate({ query: v.listDiscountRulesQuery }),
    asyncHandler(c.listDiscountRulesHandler),
);
router.post(
    "/discount-rules",
    requireAction("billing", "create"),
    validate({ body: v.createDiscountRuleBody }),
    asyncHandler(c.createDiscountRuleHandler),
);
router.get(
    "/discount-rules/:id",
    requireAction("billing", "view"),
    validate({ params: v.discountRuleIdParam }),
    asyncHandler(c.getDiscountRuleHandler),
);
router.patch(
    "/discount-rules/:id",
    requireAction("billing", "edit"),
    validate({ params: v.discountRuleIdParam, body: v.updateDiscountRuleBody }),
    asyncHandler(c.updateDiscountRuleHandler),
);

router.get(
    "/rider-discounts",
    requireAction("billing", "view"),
    validate({ query: v.listRiderDiscountsQuery }),
    asyncHandler(c.listRiderDiscountsHandler),
);
router.post(
    "/rider-discounts/:id/cancel",
    requireAction("billing", "edit"),
    validate({ params: v.riderDiscountIdParam, body: v.cancelRiderDiscountBody }),
    asyncHandler(c.cancelRiderDiscountHandler),
);

export default router;
