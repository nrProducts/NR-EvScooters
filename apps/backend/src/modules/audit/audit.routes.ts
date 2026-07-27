import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/authorize.middleware";
import { validate } from "../../middleware/validate.middleware";
import { asyncHandler } from "../../common/asyncHandler";
import { listAuditLogsHandler } from "./audit.controller";
import { listAuditLogsQuery } from "./audit.validation";

/** Mounted at /api/v1/audit-logs. Admin-only, matching audit_logs' own RLS (is_admin() read-only). */
const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/", validate({ query: listAuditLogsQuery }), asyncHandler(listAuditLogsHandler));

export default router;
