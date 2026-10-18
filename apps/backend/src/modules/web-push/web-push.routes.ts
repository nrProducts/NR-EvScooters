import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./web-push.controller";
import * as v from "./web-push.validation";

/**
 * Rider web app browser notifications, mounted at /api/v1/users/me/web-push.
 * Every handler works off req.user.id, same as riderNotificationsRouter.
 */
export const riderWebPushRouter = Router();
riderWebPushRouter.use(requireAuth);

riderWebPushRouter.get("/config", asyncHandler(c.configHandler));

// Riders only: the rider web app is the only client, and the service worker
// resolves `screen` against RIDER routes — a staff account's notifications
// carry admin-console paths that would open nowhere in it.
riderWebPushRouter.post(
    "/subscriptions",
    requireRole("rider"),
    validate({ body: v.saveSubscriptionBody }),
    asyncHandler(c.saveSubscriptionHandler),
);

// Any signed-in account may remove its OWN row (scoped by user id in the
// service) — sign-out must always be able to clean up.
riderWebPushRouter.delete(
    "/subscriptions",
    validate({ body: v.removeSubscriptionBody }),
    asyncHandler(c.removeSubscriptionHandler),
);
