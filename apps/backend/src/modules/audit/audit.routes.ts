import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAction } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { listAuditLogsHandler, listPiiAccessHandler } from "./audit.controller";
import { listAuditLogsQuery, listPiiAccessQuery } from "./audit.validation";

/** Mounted at /api/v1/audit-logs. Matches audit_logs' own RLS (is_admin() read-only) at the DB layer; admin bypasses the module-action grant unconditionally, same as everywhere else. */
const router = Router();
router.use(requireAuth);

router.get(
    "/",
    requireAction("audit", "view"),
    validate({ query: listAuditLogsQuery }),
    asyncHandler(listAuditLogsHandler),
);

export default router;

/**
 * Mounted at /api/v1/pii-access. Separate router rather than a sub-path of
 * /audit-logs because it is a different table with a different retention and
 * a different question: audit_logs answers "who changed this", pii_access_log
 * answers "who looked at this".
 */
export const piiAccessRouter = Router();
piiAccessRouter.use(requireAuth);
piiAccessRouter.get(
    "/",
    requireAction("pii_access_log", "view"),
    validate({ query: listPiiAccessQuery }),
    asyncHandler(listPiiAccessHandler),
);
