import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./referrals.controller";
import * as v from "./referrals.validation";

const router = Router();
router.use(requireAuth);

router.get("/me", asyncHandler(c.myReferralSummaryHandler));

router.post(
    "/redeem",
    validate({ body: v.redeemReferralBody }),
    asyncHandler(c.redeemReferralHandler),
);

export default router;
