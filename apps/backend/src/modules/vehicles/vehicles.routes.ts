import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./vehicles.controller";
import * as v from "./vehicles.validation";

/** Fleet inventory (admin console). See vehicle-catalog.routes.ts for the rider-facing browse catalog. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("vehicles", "view"),
    validate({ query: v.listVehiclesQuery }),
    asyncHandler(c.listVehiclesHandler),
);

router.post(
    "/",
    requireAction("vehicles", "create"),
    validate({ body: v.createVehicleBody }),
    asyncHandler(c.createVehicleHandler),
);

router.get(
    "/:id",
    requireAction("vehicles", "view"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.getVehicleHandler),
);

router.patch(
    "/:id",
    requireAction("vehicles", "edit"),
    validate({ params: v.uuidParam, body: v.updateVehicleBody }),
    asyncHandler(c.updateVehicleHandler),
);

router.post("/:id/assign", requireAuth, requireAction("vehicles", "assign"), asyncHandler(c.assignVehicleHandler));

router.post(
    "/:id/assign-to-user",
    requireAction("vehicles", "assign"),
    validate({ params: v.uuidParam, body: v.assignVehicleToUserBody }),
    asyncHandler(c.assignVehicleToUserHandler),
);

// POST /:id/photos and DELETE /:id/photos/:photoId are gone with the
// `vehicle_photos` table — see the note in vehicles.controller.ts.

router.post(
    "/:id/scrap",
    requireAction("vehicles", "delete"),
    validate({ params: v.uuidParam, body: v.scrapVehicleBody }),
    asyncHandler(c.scrapVehicleHandler),
);

export default router;
