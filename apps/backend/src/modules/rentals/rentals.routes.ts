import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./rentals.controller";
import * as v from "./rentals.validation";

/** Mounted at /api/v1/rentals. Rider routes work off req.user.id; admin routes ("Ride Management") are fleet-wide. */
const router = Router();
router.use(requireAuth);

router.get("/me/current", asyncHandler(c.myCurrentRentalHandler));
router.get(
    "/me/history",
    validate({ query: v.rentalHistoryQuery }),
    asyncHandler(c.myRentalHistoryHandler),
);

router.get(
    "/",
    requireStaff,
    validate({ query: v.listRentalsQuery }),
    asyncHandler(c.listRentalsHandler),
);

router.get(
    "/:id",
    requireStaff,
    validate({ params: v.rentalIdParam }),
    asyncHandler(c.getRentalHandler),
);

router.post(
    "/:id/complete",
    requireStaff,
    validate({ params: v.rentalIdParam, body: v.completeRideBody }),
    asyncHandler(c.completeRideHandler),
);

router.post(
    "/:id/maintenance",
    requireStaff,
    validate({ params: v.rentalIdParam, body: v.moveToMaintenanceBody }),
    asyncHandler(c.moveToMaintenanceHandler),
);

export default router;
