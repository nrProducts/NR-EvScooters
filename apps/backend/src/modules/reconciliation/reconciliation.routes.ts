import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./reconciliation.controller";
import * as v from "./reconciliation.validation";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", validate({ query: v.reconciliationQuery }), asyncHandler(c.getReconciliationHandler));

export default router;
