import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./vehicle-catalog.controller";
import * as v from "./vehicle-catalog.validation";

const router = Router();

// Reads only in this phase — the catalog is rider-browsable, not
// rider-writable (writes go through an admin CMS, not built here).
router.use(requireAuth);

router.get(
    "/",
    validate({ query: v.listVehicleModelsQuery }),
    asyncHandler(c.listVehicleModelsHandler),
);

// Declared before "/:id" so "featured" is never parsed as a uuid param —
// same care already taken for GET /users/me vs GET /users/:id.
router.get("/featured", asyncHandler(c.featuredVehicleModelHandler));

router.get(
    "/:id",
    validate({ params: v.uuidParam }),
    asyncHandler(c.getVehicleModelHandler),
);

router.get(
    "/:id/availability",
    validate({ params: v.uuidParam, query: v.availabilityQuery }),
    asyncHandler(c.vehicleModelAvailabilityHandler),
);

// Booking creation itself lives in the bookings module (POST /bookings),
// which requires requireAuth + requireKycVerified (see
// authorize.middleware.ts and modules/bookings/bookings.routes.ts).

export default router;
