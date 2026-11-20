import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import * as service from "./billing-cycle.service";
import type {
    ApplyBillingCycleBody, PreviewBillingCycleBody, UpdateBillingCycleSettingsBody,
} from "./billing-cycle.validation";

export async function getSettingsHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.getSettings());
}

export async function updateSettingsHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateBillingCycleSettingsBody;
    res.json(await service.updateSettings(body, req.user!, req));
}

export async function previewChangeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as PreviewBillingCycleBody;
    res.json(await service.previewChange(req.params.id as string, body));
}

export async function applyChangeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ApplyBillingCycleBody;
    res.json(await service.applyChange(req.params.id as string, body, req.user!));
}
