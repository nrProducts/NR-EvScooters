import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./billing.controller";
import * as v from "./billing.validation";

/** Admin-only Billing & Charges console — configurable charge rules and their materialized rider charges. */
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
router.post(
    "/rider-charges/:id/waive",
    requireAction("billing", "edit"),
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
