import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { listErrorLogsHandler } from "./errorLogs.controller";
import { listErrorLogsQuery } from "./errorLogs.validation";

/** Mounted at /api/v1/error-logs. Admin bypasses the module-action grant unconditionally, same as everywhere else — see authorize.middleware.ts's resolveAccess. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("error_logs", "view"),
    validate({ query: listErrorLogsQuery }),
    asyncHandler(listErrorLogsHandler),
);

export default router;
