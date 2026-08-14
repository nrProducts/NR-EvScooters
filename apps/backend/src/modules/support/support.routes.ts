import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireModule } from "../../middleware/authorize.middleware";
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
adminSupportRouter.use(requireAuth, requireModule("support"));

adminSupportRouter.get(
    "/",
    validate({ query: v.supportQueueQuery }),
    asyncHandler(c.supportQueueHandler),
);

adminSupportRouter.get(
    "/:id",
    validate({ params: v.supportIdParam }),
    asyncHandler(c.supportDetailHandler),
);

adminSupportRouter.patch(
    "/:id",
    validate({ params: v.supportIdParam, body: v.updateSupportBody }),
    asyncHandler(c.updateSupportRequestHandler),
);
