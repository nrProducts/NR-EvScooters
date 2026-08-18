import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { NotificationType } from "../../types";
import * as service from "./notification-settings.service";
import type { UpdateNotificationSettingBody } from "./notification-settings.validation";

/** GET /notification-settings — requireAdmin. All 7 event types with current config + recipients. */
export async function listSettingsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listSettings());
}

/** PUT /notification-settings/:type — requireAdmin. Replaces one type's config + recipient list wholesale. */
export async function updateSettingHandler(req: AuthedRequest, res: Response) {
    const type = req.params.type as NotificationType;
    const body = req.body as UpdateNotificationSettingBody;
    res.json(await service.updateSetting(type, body, req.user!, req));
}
