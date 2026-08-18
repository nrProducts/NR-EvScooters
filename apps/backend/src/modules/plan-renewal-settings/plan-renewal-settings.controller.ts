import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./plan-renewal-settings.service";
import type { UpdatePlanRenewalSettingsBody } from "./plan-renewal-settings.validation";

export async function getSettingsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getSettings());
}

export async function updateSettingsHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdatePlanRenewalSettingsBody;
    res.json(await service.updateSettings(body, req.user!, req));
}
