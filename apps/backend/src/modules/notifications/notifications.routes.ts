import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./notifications.controller";
import * as v from "./notifications.validation";

/**
 * Rider-facing routes, mounted at /api/v1/users/me/notifications — every
 * handler works off req.user.id, same as riderKycRouter.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    validate({ query: v.listNotificationsQuery }),
    asyncHandler(c.listMyNotificationsHandler),
);

router.get("/unread-count", asyncHandler(c.unreadCountHandler));

router.patch(
    "/:id/read",
    validate({ params: v.uuidParam }),
    asyncHandler(c.markReadHandler),
);

router.post("/read-all", asyncHandler(c.markAllReadHandler));

export default router;
