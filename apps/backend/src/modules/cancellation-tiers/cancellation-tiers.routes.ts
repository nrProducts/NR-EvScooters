import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./cancellation-tiers.controller";
import * as v from "./cancellation-tiers.validation";

/**
 * GET is open to any authenticated user — the rider app shows the policy
 * before a cancel is confirmed. PUT is admin-only.
 */
const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(c.listTiersHandler));
router.put(
    "/",
    requireAdmin,
    validate({ body: v.replaceCancellationTiersBody }),
    asyncHandler(c.replaceTiersHandler),
);

export default router;
