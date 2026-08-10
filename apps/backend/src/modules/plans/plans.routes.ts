import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./plans.controller";
import * as v from "./plans.validation";

/** Admin-only plan/deposit/duration configuration. Rider-facing plan browsing stays in vehicle-catalog. */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", validate({ query: v.listPlansQuery }), asyncHandler(c.listPlansHandler));
router.post("/", validate({ body: v.createPlanBody }), asyncHandler(c.createPlanHandler));
router.get("/:id", validate({ params: v.planIdParam }), asyncHandler(c.getPlanHandler));
router.patch(
    "/:id",
    validate({ params: v.planIdParam, body: v.updatePlanBody }),
    asyncHandler(c.updatePlanHandler),
);

export default router;
