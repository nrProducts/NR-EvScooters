import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireModule } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./returns.controller";
import * as v from "./returns.validation";

/** Staff/admin-only — reviewing and settling a return has no rider self-service counterpart. */
const router = Router();
router.use(requireAuth, requireModule("returns"));

router.get("/settlements", validate({ query: v.listSettlementsQuery }), asyncHandler(c.listSettlementsHandler));
router.get("/:id", validate({ params: v.rentalIdParam }), asyncHandler(c.getReturnDetailHandler));
router.post(
    "/:id/approve",
    validate({ params: v.rentalIdParam, body: v.approveReturnSettlementBody }),
    asyncHandler(c.approveReturnSettlementHandler),
);

export default router;
