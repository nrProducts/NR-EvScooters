import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./support.controller";
import * as v from "./support.validation";

/** Rider-facing routes, mounted at /api/v1/users/me/support. */
export const riderSupportRouter = Router();
riderSupportRouter.use(requireAuth);

riderSupportRouter.post(
    "/",
    validate({ body: v.createSupportBody }),
    asyncHandler(c.createSupportRequestHandler),
);

riderSupportRouter.get(
    "/",
    validate({ query: v.supportHistoryQuery }),
    asyncHandler(c.myRequestsHandler),
);

/** Admin/staff review routes, mounted at /api/v1/support. */
export const adminSupportRouter = Router();
adminSupportRouter.use(requireAuth);

adminSupportRouter.get(
    "/",
    requireAction("support", "view"),
    validate({ query: v.supportQueueQuery }),
    asyncHandler(c.supportQueueHandler),
);

adminSupportRouter.get(
    "/:id",
    requireAction("support", "view"),
    validate({ params: v.supportIdParam }),
    asyncHandler(c.supportDetailHandler),
);

adminSupportRouter.get(
    "/:id/rider-impact-preview",
    requireAction("support", "reply"),
    validate({ params: v.supportIdParam }),
    asyncHandler(c.riderImpactPreviewHandler),
);

adminSupportRouter.patch(
    "/:id",
    // NOTE: task spec said requireAction("support","respond"), but "respond" is
    // not a valid support action key in MODULE_ACTIONS (types/index.ts) — the
    // only available write action is "reply" (label "Reply / Resolve"). Using
    // "reply" here since "respond" would make this route permanently
    // unreachable for any non-admin (hasAction would always return false for
    // an action no grant can ever contain).
    requireAction("support", "reply"),
    validate({ params: v.supportIdParam, body: v.updateSupportBody }),
    asyncHandler(c.updateSupportRequestHandler),
);
