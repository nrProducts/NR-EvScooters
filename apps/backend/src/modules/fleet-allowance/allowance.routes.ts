import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import type { AuthedRequest } from "../../middleware/auth.middleware";
import { requireAction, requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as service from "./allowance.service";

/**
 * Fleet kilometre allowance. Anyone who can view vehicles can see how much of
 * it is used; only an ADMIN can change the per-bike limit or the period.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("vehicles", "view"),
    asyncHandler(async (_req, res) => {
        res.json(await service.getAllowanceSummary());
    }),
);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-05.")
    .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), "Not a real date.");

const updateBody = z.object({
    period_start: isoDate,
    period_end: isoDate,
    km_per_vehicle: z.number({ error: "Enter the kilometres per bike." })
        .positive("Must be more than 0.")
        .max(100_000, "That is more than any bike can do in a period."),
});

router.put(
    "/",
    requireAdmin,
    validate({ body: updateBody }),
    asyncHandler(async (req: AuthedRequest, res) => {
        res.json(await service.updateAllowance(req.body, req.user!, req));
    }),
);

export default router;
