import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { listAuditLogsHandler, listPiiAccessHandler } from "./audit.controller";
import { listAuditLogsQuery, listPiiAccessQuery } from "./audit.validation";

/** Mounted at /api/v1/audit-logs. Admin-only, matching audit_logs' own RLS (is_admin() read-only). */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", validate({ query: listAuditLogsQuery }), asyncHandler(listAuditLogsHandler));

export default router;

/**
 * Mounted at /api/v1/pii-access. Separate router rather than a sub-path of
 * /audit-logs because it is a different table with a different retention and
 * a different question: audit_logs answers "who changed this", pii_access_log
 * answers "who looked at this".
 */
export const piiAccessRouter = Router();
piiAccessRouter.use(requireAuth, requireAdmin);
piiAccessRouter.get("/", validate({ query: listPiiAccessQuery }), asyncHandler(listPiiAccessHandler));
