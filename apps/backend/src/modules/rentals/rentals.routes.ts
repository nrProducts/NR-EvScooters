import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireModule } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { damagePhotoUpload } from "../damages/damages.photo.upload";
import { recordDamageBody, rentalIdParam as damageRentalIdParam } from "../damages/damages.validation";
import * as c from "./rentals.controller";
import * as v from "./rentals.validation";

/**
 * Mounted at /api/v1/rentals. Rider routes work off req.user.id; admin
 * routes ("Ride Management") are fleet-wide, gated on the "vehicles"
 * module — there's no standalone Ride Management nav item today, and every
 * admin route here is only ever exercised from the Vehicles page's
 * per-vehicle actions (complete ride, move to maintenance, return
 * inspection). Revisit if a dedicated Ride Management page ever ships.
 */
const router = Router();
router.use(requireAuth);

router.get("/me/current", asyncHandler(c.myCurrentRentalHandler));
router.get(
    "/me/history",
    validate({ query: v.rentalHistoryQuery }),
    asyncHandler(c.myRentalHistoryHandler),
);
// The rider's most recent return settlement (if any) — powers the Home
// "Scooter Returned Successfully" / "Amount Due" card. See returns.service.ts.
router.get("/me/settlement", asyncHandler(c.mySettlementHandler));

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
    requireModule("vehicles"),
    validate({ query: v.listRentalsQuery }),
    asyncHandler(c.listRentalsHandler),
);

router.get(
    "/:id",
    requireModule("vehicles"),
    validate({ params: v.rentalIdParam }),
    asyncHandler(c.getRentalHandler),
);

router.post(
    "/:id/complete",
    requireModule("vehicles"),
    validate({ params: v.rentalIdParam, body: v.completeRideBody }),
    asyncHandler(c.completeRideHandler),
);

router.post(
    "/:id/maintenance",
    requireModule("vehicles"),
    validate({ params: v.rentalIdParam, body: v.moveToMaintenanceBody }),
    asyncHandler(c.moveToMaintenanceHandler),
);

// Staff decline of a pending return request — the counterpart to /:id/complete
// and /:id/maintenance (which each implicitly APPROVE one, see
// returnApprovalPayload in rentals.service.ts). Unlike those two, this does
// not touch vehicle status or booking status at all: the rental simply goes
// back to being a normal active ride with no return pending.
router.post(
    "/:id/return-reject",
    requireModule("vehicles"),
    validate({ params: v.rentalIdParam, body: v.rejectReturnBody }),
    asyncHandler(c.rejectReturnHandler),
);

// Return-inspection damage entry — a separate action from /:id/complete
// (which staff still call to close the physical ride out and settle any
// late fee); a no-damage return never touches this endpoint at all.
router.post(
    "/:id/return-inspection",
    requireModule("vehicles"),
    validate({ params: damageRentalIdParam }),
    damagePhotoUpload,
    validate({ body: recordDamageBody }),
    asyncHandler(c.returnInspectionHandler),
);

export default router;
