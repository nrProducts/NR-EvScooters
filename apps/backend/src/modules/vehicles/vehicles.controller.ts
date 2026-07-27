import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./vehicles.service";
import { CreateVehicleInput, ListVehiclesFilters, UpdateVehicleInput } from "./vehicles.types";

export async function listVehiclesHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListVehiclesFilters>(req);
    const result = await service.listVehicles(filters);
    res.json(result);
}

export async function getVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.getVehicleById(req.params.id as string);
    res.json(vehicle);
}

export async function createVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.createVehicle(req.body as CreateVehicleInput, req.user!, req);
    res.status(201).json(vehicle);
}

export async function updateVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.updateVehicle(req.params.id as string, req.body as UpdateVehicleInput, req.user!, req);
    res.json(vehicle);
}

export async function assignVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.assignVehicle(req.params.id as string, req.user!.id! as string);
    res.json(vehicle);
}
