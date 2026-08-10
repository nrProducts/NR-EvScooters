import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./plans.service";
import { CreatePlanBody, ListPlansQuery, UpdatePlanBody } from "./plans.validation";

export async function listPlansHandler(req: AuthedRequest, res: Response) {
    const { vehicleModelId, active, ...page } = validatedQuery<ListPlansQuery>(req);
    res.json(await service.listPlans({ ...page, vehicleModelId, active }));
}

export async function listVehicleModelOptionsHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listVehicleModelOptions());
}

export async function getPlanHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getPlanById(req.params.id as string));
}

export async function createPlanHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreatePlanBody;
    const plan = await service.createPlan(body, req.user!);
    res.status(201).json(plan);
}

export async function updatePlanHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdatePlanBody;
    res.json(await service.updatePlan(req.params.id as string, body, req.user!));
}
