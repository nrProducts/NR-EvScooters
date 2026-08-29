import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./cancellation-tiers.service";
import type { ReplaceCancellationTiersBody } from "./cancellation-tiers.validation";

export async function listTiersHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listTiers());
}

export async function replaceTiersHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ReplaceCancellationTiersBody;
    res.json(await service.replaceTiers(body, req.user!, req));
}
