import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./plans.controller";
import * as v from "./plans.validation";

/** Admin-only plan/deposit/duration configuration. Rider-facing plan browsing stays in vehicle-catalog. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("plans", "view"),
    validate({ query: v.listPlansQuery }),
    asyncHandler(c.listPlansHandler),
);
router.post(
    "/",
    requireAction("plans", "create"),
    validate({ body: v.createPlanBody }),
    asyncHandler(c.createPlanHandler),
);

// Declared before "/:id" so "vehicle-model-options" is never parsed as a
// uuid param — same care already taken for GET /users/me vs GET /users/:id.
router.get(
    "/vehicle-model-options",
    requireAction("plans", "view"),
    asyncHandler(c.listVehicleModelOptionsHandler),
);

router.get(
    "/:id",
    requireAction("plans", "view"),
    validate({ params: v.planIdParam }),
    asyncHandler(c.getPlanHandler),
);
router.patch(
    "/:id",
    requireAction("plans", "edit"),
    validate({ params: v.planIdParam, body: v.updatePlanBody }),
    asyncHandler(c.updatePlanHandler),
);

export default router;
