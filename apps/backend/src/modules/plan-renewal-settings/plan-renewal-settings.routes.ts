import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./plan-renewal-settings.controller";
import * as v from "./plan-renewal-settings.validation";

/** Admin-only — the late renewal fee is a configuration decision, not a delegable staff module. */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(c.getSettingsHandler));
router.put("/", validate({ body: v.updatePlanRenewalSettingsBody }), asyncHandler(c.updateSettingsHandler));

export default router;
