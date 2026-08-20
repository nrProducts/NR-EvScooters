import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./vehicles.service";
import { CreateVehicleInput, ListVehiclesFilters, ScrapVehicleInput, UpdateVehicleInput } from "./vehicles.types";

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

export async function assignVehicleToUserHandler(req: AuthedRequest, res: Response) {
    const { user_id, unassign_existing } = req.body as { user_id: string; unassign_existing?: boolean };
    const { vehicle } = await service.assignVehicleToUser(req.params.id as string, user_id, req.user!, undefined, {
        unassignExisting: unassign_existing,
    });
    res.json(vehicle);
}

/*
 * uploadVehiclePhotoHandler / deleteVehiclePhotoHandler lived here.
 *
 * `vehicle_photos` is not in the new schema. The audit found the table held
 * zero rows and duplicated `vehicle_models.image`
 * (docs/database-audit/05-initial-problems.md), so model imagery is
 * `vehicle_model_media` and a photo of one unit's damage belongs to its
 * incident. There is nowhere left for a per-unit photo, so the endpoints are
 * gone rather than writing to a table that does not exist.
 */

export async function scrapVehicleHandler(req: AuthedRequest, res: Response) {
    const vehicle = await service.scrapVehicle(req.params.id as string, req.body as ScrapVehicleInput, req.user!);
    res.json(vehicle);
}
