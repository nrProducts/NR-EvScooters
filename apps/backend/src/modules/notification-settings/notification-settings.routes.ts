import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./notification-settings.controller";
import * as v from "./notification-settings.validation";

/** Admin-only — who gets notified for which event is a configuration decision, not a delegable staff module. */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", asyncHandler(c.listSettingsHandler));
router.put(
    "/:type",
    validate({ params: v.notificationTypeParam, body: v.updateNotificationSettingBody }),
    asyncHandler(c.updateSettingHandler),
);

export default router;
