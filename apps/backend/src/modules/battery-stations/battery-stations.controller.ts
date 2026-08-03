import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { isAdmin } from "../../middleware/authorize.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./battery-stations.service";
import type {
    CreateStationBody, ListAdminStationsQuery, ListMobileStationsQuery, UpdateStationBody, VisibilityBody,
} from "./battery-stations.validation";

// --- mobile -------------------------------------------------------------

export async function listMobileStationsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListMobileStationsQuery>(req);
    const data = await service.listStationsForMobile(filters, isAdmin(req));
    res.json({ data });
}

export async function getStationHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getStationById(req.params.id as string, isAdmin(req)));
}

// --- admin --------------------------------------------------------------

export async function listAdminStationsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListAdminStationsQuery>(req);
    res.json(await service.listStationsForAdmin(filters));
}

export async function stationSummaryHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getStationSummary());
}

export async function createStationHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateStationBody;
    res.status(201).json(await service.createStation(body, req.user!, req));
}

export async function updateStationHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateStationBody;
    res.json(await service.updateStation(req.params.id as string, body, req.user!, req));
}

export async function updateVisibilityHandler(req: AuthedRequest, res: Response) {
    const { isVisibleOnMobile } = req.body as VisibilityBody;
    res.json(await service.setStationVisibility(req.params.id as string, isVisibleOnMobile, req.user!, req));
}

export async function deleteStationHandler(req: AuthedRequest, res: Response) {
    await service.softDeleteStation(req.params.id as string, req.user!, req);
    res.status(204).send();
}
