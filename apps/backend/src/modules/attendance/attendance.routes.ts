import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction, requireRole } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import * as c from "./attendance.controller";
import * as v from "./attendance.validation";

/**
 * Mounted at /api/v1/attendance. `me/*` routes work off req.user.id and are
 * gated with requireRole("staff") — NOT requireStaff (which is staff OR
 * admin) — because attendance tracking applies to staff only; admin manages
 * it (see the admin routes below) but is never themselves rostered, present,
 * absent, or clocked in. This is deliberately stricter than requireStaff to
 * match getTodayRoster()'s role='staff' filter: an admin account hitting
 * these routes directly must 403, not silently create a record nobody's
 * roster query will ever surface. Admin routes are fleet-wide and gated with
 * requireAction("attendance", ...).
 */
const router = Router();
router.use(requireAuth);

router.post("/me/check-in", requireRole("staff"), asyncHandler(c.checkInHandler));
router.post("/me/check-out", requireRole("staff"), asyncHandler(c.checkOutHandler));
router.get("/me/today", requireRole("staff"), asyncHandler(c.myTodayHandler));
router.get(
    "/me/history",
    requireRole("staff"),
    validate({ query: v.myAttendanceHistoryQuery }),
    asyncHandler(c.myHistoryHandler),
);

router.get("/today", requireAction("attendance", "view"), asyncHandler(c.todayRosterHandler));
router.get(
    "/",
    requireAction("attendance", "view"),
    validate({ query: v.listAttendanceQuery }),
    asyncHandler(c.listAttendanceHandler),
);

export default router;
