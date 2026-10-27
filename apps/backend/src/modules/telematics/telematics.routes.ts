import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as service from "./telematics.service";
import * as distance from "./distance.service";
import * as control from "./control.service";
import * as refresh from "./refresh.service";
import { businessToday } from "../../common/dates";
import type { AuthedRequest } from "../../middleware/auth.middleware";

/**
 * Live scooter data — ADMIN CONSOLE ONLY. Nothing here is mounted for riders,
 * and a scooter's position never leaves these routes. Read-only: the data is
 * written by the telematics-sync Edge Function.
 */
const router = Router();
router.use(requireAuth);

const vehicleIdParam = z.object({ vehicleId: z.string().uuid("A valid vehicle id is required.") });

router.get(
    "/",
    requireAction("vehicles", "view"),
    asyncHandler(async (_req, res) => {
        res.json(await service.listVehicleTelemetry());
    }),
);

router.get(
    "/vehicles/:vehicleId",
    requireAction("vehicles", "view"),
    validate({ params: vehicleIdParam }),
    asyncHandler(async (req, res) => {
        // `null` (not 404) for a vehicle that exists but has never synced, so
        // the console can show "waiting for the first reading".
        res.json({ telemetry: await service.getVehicleTelemetry(req.params.vehicleId as string) });
    }),
);

// Kilometres per bike: today / last 7 days / last 30 days, for the whole fleet.
router.get(
    "/distance",
    requireAction("vehicles", "view"),
    asyncHandler(async (_req, res) => {
        res.json(await service.listBikeKms(businessToday()));
    }),
);

// ---------------------------------------------------------------------------
// Refresh status ("last updated", what refreshes how often) and manual refresh.
// ---------------------------------------------------------------------------

router.get(
    "/status",
    requireAction("vehicles", "view"),
    asyncHandler(async (_req, res) => {
        res.json(await refresh.getTrackingStatus());
    }),
);

const refreshBody = z.object({ kind: z.enum(["live", "distance"]) });

// Admin only: a refresh calls out to Intellicar, whose daily call allowance is
// shared by everyone. Guard rails (cooldown, daily cap) live in refresh.service.
router.post(
    "/refresh",
    requireAdmin,
    validate({ body: refreshBody }),
    asyncHandler(async (req: AuthedRequest, res) => {
        res.status(202).json(await refresh.triggerRefresh(req.body.kind, req.user!.id));
    }),
);

const rentalIdParam = z.object({ rentalId: z.string().uuid("A valid rental id is required.") });

// Shown on the Return Detail screen, so it follows the returns permission.
router.get(
    "/rentals/:rentalId/distance",
    requireAction("returns", "view"),
    validate({ params: rentalIdParam }),
    asyncHandler(async (req, res) => {
        res.json(await distance.getRentalDistance(req.params.rentalId as string));
    }),
);

// ---------------------------------------------------------------------------
// Remote control — ADMIN ONLY. See control.service.ts for every guard.
// ---------------------------------------------------------------------------

const controlBody = z.object({
    mode: z
        .enum(["ignition", "crank", "movement", "can", "charge", "discharge", "chargendischarge"])
        .default("ignition"),
    reason: z.string().trim().min(5, "Give a reason of at least 5 characters.").max(500),
    confirmRegistration: z.string().trim().min(1, "Type the vehicle's registration number to confirm.").max(40),
    acknowledgeMoving: z.boolean().default(false),
});

for (const action of ["immobilise", "mobilise"] as const) {
    router.post(
        `/vehicles/:vehicleId/${action}`,
        requireAdmin,
        validate({ params: vehicleIdParam, body: controlBody }),
        asyncHandler(async (req: AuthedRequest, res) => {
            const result = await control.controlVehicle(
                { vehicleId: req.params.vehicleId as string, action, ...req.body },
                req.user!,
                req,
            );
            res.status(202).json(result);
        }),
    );
}

router.get(
    "/vehicles/:vehicleId/commands",
    requireAdmin,
    validate({ params: vehicleIdParam }),
    asyncHandler(async (req, res) => {
        res.json(await control.listControlCommands(req.params.vehicleId as string));
    }),
);

export default router;
