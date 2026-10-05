import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireStaff } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./leave.controller";
import * as v from "./leave.validation";

/**
 * Mounted at /api/v1/leave. `me/*` routes work off req.user.id and are
 * gated with requireStaff (not requireAction), same reasoning as
 * attendance.routes.ts. Admin routes are fleet-wide and gated with
 * requireAction("leave", ...).
 */
const router = Router();
router.use(requireAuth);

router.get("/types", requireStaff, asyncHandler(c.listTypesHandler));
router.get("/me/balance", requireStaff, asyncHandler(c.myBalanceHandler));
router.get(
    "/me/preview",
    requireStaff,
    validate({ query: v.previewLeaveQuery }),
    asyncHandler(c.previewHandler),
);
router.get("/me", requireStaff, validate({ query: v.myLeaveQuery }), asyncHandler(c.myRequestsHandler));
router.post("/me", requireStaff, validate({ body: v.applyLeaveBody }), asyncHandler(c.applyHandler));
router.post(
    "/me/:id/cancel",
    requireStaff,
    validate({ params: v.uuidParam }),
    asyncHandler(c.cancelHandler),
);

router.get(
    "/",
    requireAction("leave", "view"),
    validate({ query: v.listLeaveQuery }),
    asyncHandler(c.listHandler),
);
router.post(
    "/:id/approve",
    requireAction("leave", "approve"),
    validate({ params: v.uuidParam, body: v.reviewLeaveBody }),
    asyncHandler(c.approveHandler),
);
router.post(
    "/:id/reject",
    requireAction("leave", "approve"),
    validate({ params: v.uuidParam, body: v.rejectLeaveBody }),
    asyncHandler(c.rejectHandler),
);

export default router;
