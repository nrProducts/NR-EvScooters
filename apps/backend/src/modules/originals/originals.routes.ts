import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as service from "./originals.service";

/** Original documents held for a rider — staff console only. */
const router = Router();
router.use(requireAuth);

const userIdParam = z.object({ userId: z.string().uuid("A valid user id is required.") });

router.get(
    "/users/:userId",
    requireAction("users", "view"),
    validate({ params: userIdParam }),
    asyncHandler(async (req, res) => {
        res.json(await service.listOriginalsForUser(req.params.userId as string));
    }),
);

const rentalIdParam = z.object({ rentalId: z.string().uuid("A valid rental id is required.") });

// Used by the Complete Return dialog to know whether to ask "were the originals returned?".
router.get(
    "/rentals/:rentalId",
    requireAction("returns", "view"),
    validate({ params: rentalIdParam }),
    asyncHandler(async (req, res) => {
        res.json({ originals: await service.getOriginalsForRental(req.params.rentalId as string) });
    }),
);

export default router;
