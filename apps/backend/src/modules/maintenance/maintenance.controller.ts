import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./maintenance.service";

export async function myMaintenanceHistoryHandler(req: AuthedRequest, res: Response) {
    const data = await service.getMyMaintenanceHistory(req.user!.id);
    res.json({ data, pagination: { page: 1, pageSize: data.length, total: data.length, totalPages: 1 } });
}
