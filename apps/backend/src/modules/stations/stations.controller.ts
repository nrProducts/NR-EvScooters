import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { NearestStationQuery } from "./stations.validation";
import * as service from "./stations.service";

export async function nearestStationHandler(req: AuthedRequest, res: Response) {
    const { lat, lng } = validatedQuery<NearestStationQuery>(req);
    res.json(await service.getNearestStation(lat, lng));
}
