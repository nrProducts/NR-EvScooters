import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./holidays.controller";
import * as v from "./holidays.validation";

/**
 * Mounted at /api/v1/holidays. Admin-maintained government/public holiday
 * calendar — view is a coarser grant than manage, same split as
 * leave.routes.ts's view/approve.
 */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("holidays", "view"),
    validate({ query: v.listHolidayQuery }),
    asyncHandler(c.listHandler),
);

router.post(
    "/",
    requireAction("holidays", "manage"),
    validate({ body: v.createHolidayBody }),
    asyncHandler(c.createHandler),
);

router.patch(
    "/:id",
    requireAction("holidays", "manage"),
    validate({ params: v.uuidParam, body: v.updateHolidayBody }),
    asyncHandler(c.updateHandler),
);

router.delete(
    "/:id",
    requireAction("holidays", "manage"),
    validate({ params: v.uuidParam }),
    asyncHandler(c.deleteHandler),
);

export default router;
