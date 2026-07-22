import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./stations.controller";
import * as v from "./stations.validation";

const router = Router();

router.use(requireAuth);

// Declared before any future "/:id" route, same convention as every other
// module — no dynamic route exists here yet, kept for consistency.
router.get(
    "/nearest",
    validate({ query: v.nearestStationQuery }),
    asyncHandler(c.nearestStationHandler),
);

export default router;
