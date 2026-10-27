import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin, requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./referrals.controller";
import * as v from "./referrals.validation";
import { getUserReferralsForAdmin } from "./referrals.service";

const router = Router();
router.use(requireAuth);

router.get("/me", asyncHandler(c.myReferralSummaryHandler));

router.post(
    "/redeem",
    validate({ body: v.redeemReferralBody }),
    asyncHandler(c.redeemReferralHandler),
);

router.post(
    "/apply-card",
    validate({ body: v.applyCardBody }),
    asyncHandler(c.applyCardHandler),
);
router.post("/redemptions/:redemptionId/release", asyncHandler(c.releaseCardHandler));

// Admin-only: the live programme terms (reward amount, qualifying event,
// expiry, caps). Not reachable by a rider even read-only — the row carries
// operational detail (e.g. min_renewal_amount tuning) a rider has no need to
// see; what a rider is ENTITLED to know (whether referrals are on, and what
// they currently pay) already comes back from GET /referrals/me.
router.get("/admin/program", requireAdmin, asyncHandler(c.getReferralProgramHandler));
router.put(
    "/admin/program",
    requireAdmin,
    validate({ body: v.updateReferralProgramBody }),
    asyncHandler(c.updateReferralProgramHandler),
);

// Staff view of one user's referral graph (who referred them, who they referred).
router.get(
    "/admin/users/:userId",
    requireAction("users", "view"),
    validate({ params: z.object({ userId: z.string().uuid("A valid user id is required.") }) }),
    asyncHandler(async (req, res) => {
        res.json(await getUserReferralsForAdmin(req.params.userId as string));
    }),
);

export default router;
