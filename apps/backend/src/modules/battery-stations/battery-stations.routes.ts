import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./battery-stations.controller";
import * as v from "./battery-stations.validation";

/**
 * Mounted at /api/v1/battery-stations. Read-only for any authenticated user;
 * an admin token widens the result set to include hidden stations (see
 * listStationsForMobile) but never changes the write surface, which lives
 * entirely on adminBatteryStationsRouter below.
 */
export const batteryStationsRouter = Router();

batteryStationsRouter.use(requireAuth);

batteryStationsRouter.get(
    "/",
    validate({ query: v.listMobileStationsQuery }),
    asyncHandler(c.listMobileStationsHandler),
);

batteryStationsRouter.get(
    "/:id",
    validate({ params: v.uuidParam }),
    asyncHandler(c.getStationHandler),
);

/**
 * Mounted at /api/v1/admin/battery-stations. requireAdmin on the router, not
 * per-route, so a future endpoint can't be added without the check.
 */
export const adminBatteryStationsRouter = Router();

adminBatteryStationsRouter.use(requireAuth, requireAdmin);

// Declared before "/:id" so the literal segment isn't swallowed by the param.
adminBatteryStationsRouter.get("/summary", asyncHandler(c.stationSummaryHandler));

adminBatteryStationsRouter.get(
    "/",
    validate({ query: v.listAdminStationsQuery }),
    asyncHandler(c.listAdminStationsHandler),
);

adminBatteryStationsRouter.post(
    "/",
    validate({ body: v.createStationBody }),
    asyncHandler(c.createStationHandler),
);

// PUT and PATCH share a handler: both take a partial body and both are
// specified in the brief, so accepting either avoids a client-side coin toss.
adminBatteryStationsRouter.put(
    "/:id",
    validate({ params: v.uuidParam, body: v.updateStationBody }),
    asyncHandler(c.updateStationHandler),
);

adminBatteryStationsRouter.patch(
    "/:id",
    validate({ params: v.uuidParam, body: v.updateStationBody }),
    asyncHandler(c.updateStationHandler),
);

adminBatteryStationsRouter.patch(
    "/:id/visibility",
    validate({ params: v.uuidParam, body: v.visibilityBody }),
    asyncHandler(c.updateVisibilityHandler),
);

adminBatteryStationsRouter.delete(
    "/:id",
    validate({ params: v.uuidParam }),
    asyncHandler(c.deleteStationHandler),
);
