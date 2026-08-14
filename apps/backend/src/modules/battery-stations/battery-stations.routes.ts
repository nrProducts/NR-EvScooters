import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
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
 * Mounted at /api/v1/admin/battery-stations. requireAuth on the router;
 * each route below additionally carries its own requireAction("battery_stations", ...)
 * grant so a future endpoint isn't accidentally added without one.
 */
export const adminBatteryStationsRouter = Router();

adminBatteryStationsRouter.use(requireAuth);

// Declared before "/:id" so the literal segment isn't swallowed by the param.
adminBatteryStationsRouter.get(
    "/summary",
    requireAction("battery_stations", "view"),
    asyncHandler(c.stationSummaryHandler),
);

adminBatteryStationsRouter.get(
    "/",
    requireAction("battery_stations", "view"),
    validate({ query: v.listAdminStationsQuery }),
    asyncHandler(c.listAdminStationsHandler),
);

adminBatteryStationsRouter.post(
    "/",
    requireAction("battery_stations", "create"),
    validate({ body: v.createStationBody }),
    asyncHandler(c.createStationHandler),
);

// PUT and PATCH share a handler: both take a partial body and both are
// specified in the brief, so accepting either avoids a client-side coin toss.
adminBatteryStationsRouter.put(
    "/:id",
    requireAction("battery_stations", "edit"),
    validate({ params: v.uuidParam, body: v.updateStationBody }),
    asyncHandler(c.updateStationHandler),
);

adminBatteryStationsRouter.patch(
    "/:id",
    requireAction("battery_stations", "edit"),
    validate({ params: v.uuidParam, body: v.updateStationBody }),
    asyncHandler(c.updateStationHandler),
);

adminBatteryStationsRouter.patch(
    "/:id/visibility",
    requireAction("battery_stations", "edit"),
    validate({ params: v.uuidParam, body: v.visibilityBody }),
    asyncHandler(c.updateVisibilityHandler),
);

adminBatteryStationsRouter.delete(
    "/:id",
    requireAction("battery_stations", "delete"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.deleteStationHandler),
);
