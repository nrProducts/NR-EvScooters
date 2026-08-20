import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./holidays.service";
import { CreateHolidayInput, ListHolidayFilters, UpdateHolidayInput } from "./holidays.types";

export async function listHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListHolidayFilters>(req);
    const result = await service.listHolidays(filters);
    res.json(result);
}

export async function createHandler(req: AuthedRequest, res: Response) {
    const holiday = await service.createHoliday(req.body as CreateHolidayInput, req.user!);
    res.status(201).json(holiday);
}

export async function updateHandler(req: AuthedRequest, res: Response) {
    const holiday = await service.updateHoliday(req.params.id as string, req.body as UpdateHolidayInput, req.user!);
    res.json(holiday);
}

export async function deleteHandler(req: AuthedRequest, res: Response) {
    await service.deleteHoliday(req.params.id as string, req.user!);
    res.status(204).send();
}
