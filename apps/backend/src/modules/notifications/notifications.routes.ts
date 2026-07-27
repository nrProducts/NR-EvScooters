import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./notifications.controller";
import * as v from "./notifications.validation";

/**
 * Rider-facing routes, mounted at /api/v1/users/me/notifications — every
 * handler works off req.user.id, same as riderKycRouter.
 */
export const riderNotificationsRouter = Router();
riderNotificationsRouter.use(requireAuth);

riderNotificationsRouter.get(
    "/",
    validate({ query: v.listNotificationsQuery }),
    asyncHandler(c.listMyNotificationsHandler),
);

riderNotificationsRouter.get("/unread-count", asyncHandler(c.unreadCountHandler));

riderNotificationsRouter.patch(
    "/:id/read",
    validate({ params: v.uuidParam }),
    asyncHandler(c.markReadHandler),
);

riderNotificationsRouter.post("/read-all", asyncHandler(c.markAllReadHandler));

/**
 * Admin/staff routes, mounted at /api/v1/notifications — the fleet-wide
 * notification log plus composing a new broadcast.
 */
export const adminNotificationsRouter = Router();
adminNotificationsRouter.use(requireAuth, requireStaff);

adminNotificationsRouter.get(
    "/",
    validate({ query: v.listAdminNotificationsQuery }),
    asyncHandler(c.listAllNotificationsHandler),
);

adminNotificationsRouter.post(
    "/broadcast",
    validate({ body: v.broadcastBody }),
    asyncHandler(c.broadcastHandler),
);
