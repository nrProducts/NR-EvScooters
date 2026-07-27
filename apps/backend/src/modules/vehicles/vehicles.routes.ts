import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
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
    requireStaff,
    validate({ query: v.listVehiclesQuery }),
    asyncHandler(c.listVehiclesHandler),
);

router.post(
    "/",
    requireStaff,
    validate({ body: v.createVehicleBody }),
    asyncHandler(c.createVehicleHandler),
);

router.get(
    "/:id",
    requireStaff,
    validate({ params: v.uuidParam }),
    asyncHandler(c.getVehicleHandler),
);

router.patch(
    "/:id",
    requireStaff,
    validate({ params: v.uuidParam, body: v.updateVehicleBody }),
    asyncHandler(c.updateVehicleHandler),
);

router.post("/:id/assign", asyncHandler(c.assignVehicleHandler));

router.post(
    "/:id/photos",
    requireStaff,
    validate({ params: v.uuidParam }),
    vehiclePhotoUpload,
    asyncHandler(c.uploadVehiclePhotoHandler),
);

router.delete(
    "/:id/photos/:photoId",
    requireStaff,
    validate({ params: v.photoIdParam }),
    asyncHandler(c.deleteVehiclePhotoHandler),
);

router.post(
    "/:id/scrap",
    requireStaff,
    validate({ params: v.uuidParam, body: v.scrapVehicleBody }),
    asyncHandler(c.scrapVehicleHandler),
);

export default router;
