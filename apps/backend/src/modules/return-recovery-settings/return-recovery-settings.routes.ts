import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./return-recovery-settings.controller";
import * as v from "./return-recovery-settings.validation";

/** Admin-only — the recovery day cap is a policy decision, not a delegable staff module. */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(c.getSettingsHandler));
router.put("/", validate({ body: v.updateReturnRecoverySettingsBody }), asyncHandler(c.updateSettingsHandler));

export default router;
