import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./maintenance.service";
import {
    AssignTempVehicleInput, CreateMaintenanceInput, ListMaintenanceFilters, NotRepairableInput,
    QuickFixInput, ReassignAfterScrapInput, UpdateMaintenanceInput,
} from "./maintenance.types";

export async function myMaintenanceHistoryHandler(req: AuthedRequest, res: Response) {
    const data = await service.getMyMaintenanceHistory(req.user!.id);
    res.json({ data, pagination: { page: 1, pageSize: data.length, total: data.length, totalPages: 1 } });
}

export async function myMaintenanceNoticeHandler(req: AuthedRequest, res: Response) {
    const notice = await service.getMyMaintenanceNotice(req.user!.id);
    res.json(notice);
}

export async function listMaintenanceHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListMaintenanceFilters>(req);
    const result = await service.listMaintenance(filters);
    res.json(result);
}

export async function createMaintenanceHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.createMaintenanceTicket(req.body as CreateMaintenanceInput, req.user!);
    res.status(201).json(ticket);
}

export async function updateMaintenanceHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.updateMaintenanceTicket(
        req.params.id as string,
        req.body as UpdateMaintenanceInput,
        req.user!,
    );
    res.json(ticket);
}

export async function quickFixHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.triageQuickFix(req.params.id as string, req.body as QuickFixInput, req.user!);
    res.json(ticket);
}

export async function assignTempVehicleHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.assignTempVehicle(
        req.params.id as string,
        req.body as AssignTempVehicleInput,
        req.user!,
    );
    res.json(ticket);
}

export async function notRepairableHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.resolveNotRepairable(
        req.params.id as string,
        req.body as NotRepairableInput,
        req.user!,
    );
    res.json(ticket);
}

export async function reassignHandler(req: AuthedRequest, res: Response) {
    const ticket = await service.reassignAfterScrap(
        req.params.id as string,
        req.body as ReassignAfterScrapInput,
        req.user!,
    );
    res.json(ticket);
}
