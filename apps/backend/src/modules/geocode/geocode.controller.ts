import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./geocode.service";
import type { SearchAreasQuery } from "./geocode.validation";

/** GET /geocode/search?q=&lat=&lng= */
export async function searchAreasHandler(req: AuthedRequest, res: Response) {
    const { q, lat, lng } = validatedQuery<SearchAreasQuery>(req);
    const near = lat !== undefined && lng !== undefined ? { lat, lng } : undefined;
    res.json({ data: await service.searchAreas(q, near) });
}
