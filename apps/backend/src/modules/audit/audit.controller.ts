import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { listAuditLogs, listPiiAccess } from "./audit.service";
import { ListAuditLogsFilters, ListPiiAccessFilters } from "./audit.types";

export async function listAuditLogsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListAuditLogsFilters>(req);
    res.json(await listAuditLogs(filters));
}

/** GET /pii-access — admin only. The read-side counterpart of the audit log. */
export async function listPiiAccessHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListPiiAccessFilters>(req);
    res.json(await listPiiAccess(filters));
}
