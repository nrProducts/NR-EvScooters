import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireModule } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { vehiclePhotoUpload } from "./vehicles.photo.upload";
import * as c from "./vehicles.controller";
import * as v from "./vehicles.validation";

/** Fleet inventory (admin console). See vehicle-catalog.routes.ts for the rider-facing browse catalog. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireModule("vehicles"),
    validate({ query: v.listVehiclesQuery }),
    asyncHandler(c.listVehiclesHandler),
);

router.post(
    "/",
    requireModule("vehicles"),
    validate({ body: v.createVehicleBody }),
    asyncHandler(c.createVehicleHandler),
);

router.get(
    "/:id",
    requireModule("vehicles"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.getVehicleHandler),
);

router.patch(
    "/:id",
    requireModule("vehicles"),
    validate({ params: v.uuidParam, body: v.updateVehicleBody }),
    asyncHandler(c.updateVehicleHandler),
);

router.post("/:id/assign", asyncHandler(c.assignVehicleHandler));

router.post(
    "/:id/assign-to-user",
    requireModule("vehicles"),
    validate({ params: v.uuidParam, body: v.assignVehicleToUserBody }),
    asyncHandler(c.assignVehicleToUserHandler),
);

router.post(
    "/:id/photos",
    requireModule("vehicles"),
    validate({ params: v.uuidParam }),
    vehiclePhotoUpload,
    asyncHandler(c.uploadVehiclePhotoHandler),
);

router.delete(
    "/:id/photos/:photoId",
    requireModule("vehicles"),
    validate({ params: v.photoIdParam }),
    asyncHandler(c.deleteVehiclePhotoHandler),
);

router.post(
    "/:id/scrap",
    requireModule("vehicles"),
    validate({ params: v.uuidParam, body: v.scrapVehicleBody }),
    asyncHandler(c.scrapVehicleHandler),
);

export default router;
