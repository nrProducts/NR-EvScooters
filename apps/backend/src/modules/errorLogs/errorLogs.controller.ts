import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { listErrorLogs } from "./errorLogs.service";
import { ListErrorLogsFilters } from "./errorLogs.types";

export async function listErrorLogsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListErrorLogsFilters>(req);
    res.json(await listErrorLogs(filters));
}
