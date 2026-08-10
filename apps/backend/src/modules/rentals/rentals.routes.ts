import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { damagePhotoUpload } from "../damages/damages.photo.upload";
import { recordDamageBody, rentalIdParam as damageRentalIdParam } from "../damages/damages.validation";
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

// Rider-initiated post-pickup return REQUEST. Scoped to the caller's own
// rental inside the service, so no requireStaff. Does not end the ride —
// staff close it via POST /:id/complete below, which settles any late fee.
router.post(
    "/:id/return-request",
    validate({ params: v.rentalIdParam, body: v.requestReturnBody }),
    asyncHandler(c.requestReturnHandler),
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

// Return-inspection damage entry — a separate action from /:id/complete
// (which staff still call to close the physical ride out and settle any
// late fee); a no-damage return never touches this endpoint at all.
router.post(
    "/:id/return-inspection",
    requireStaff,
    validate({ params: damageRentalIdParam }),
    damagePhotoUpload,
    validate({ body: recordDamageBody }),
    asyncHandler(c.returnInspectionHandler),
);

export default router;
