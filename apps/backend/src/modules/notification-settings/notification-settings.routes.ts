import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./notification-settings.controller";
import * as v from "./notification-settings.validation";

/**
 * Who gets notified for which event is a configuration decision, not a
 * delegable staff module — so every WRITE here, and the read that exposes
 * subscriber lists, stays requireAdmin.
 *
 * The one exception is `/types`, below. Interpreting a notification you have
 * already received is not configuration.
 */
const router = Router();
router.use(requireAuth);

/**
 * The catalogue without subscriber lists. Staff-readable.
 *
 * Declared before "/" so neither shadows the other, and separate from it
 * because the two answer different questions: this one is "is this
 * notification a task, and where do I go to act on it", which any staff
 * member receiving one needs. The console's realtime layer used to ask the
 * admin-only endpoint below, so a staff session got a 403 and every
 * actionable notification quietly degraded to a bell tick.
 */
router.get("/types", requireStaff, asyncHandler(c.listTypeSummariesHandler));

router.get("/", requireAdmin, asyncHandler(c.listSettingsHandler));

router.put(
    "/:type",
    requireAdmin,
    validate({ params: v.notificationTypeParam, body: v.updateNotificationSettingBody }),
    asyncHandler(c.updateSettingHandler),
);

export default router;
