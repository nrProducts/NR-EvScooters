import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { ListVehicleModelsFilters } from "./vehicle-catalog.types";
import { AvailabilityQuery } from "./vehicle-catalog.validation";
import * as service from "./vehicle-catalog.service";

export async function listVehicleModelsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListVehicleModelsFilters>(req);
    res.json(await service.listVehicleModels(filters));
}

export async function featuredVehicleModelHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getFeaturedVehicleModel());
}

export async function getVehicleModelHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getVehicleModelById(req.params.id as string));
}

export async function vehicleModelAvailabilityHandler(req: AuthedRequest, res: Response) {
    const { stationId } = validatedQuery<AvailabilityQuery>(req);
    res.json(await service.getAvailabilityForModel(req.params.id as string, stationId));
}
