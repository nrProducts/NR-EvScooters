import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { listAuditLogs } from "./audit.service";
import { ListAuditLogsFilters } from "./audit.types";

export async function listAuditLogsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListAuditLogsFilters>(req);
    res.json(await listAuditLogs(filters));
}
