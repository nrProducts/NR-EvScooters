import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { NotificationTypeCode } from "../../types";
import * as service from "./notification-settings.service";
import type { UpdateNotificationSettingBody } from "./notification-settings.validation";

/** GET /notification-settings — requireAdmin. Every event type with current config + recipients. */
export async function listSettingsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listSettings());
}

/**
 * GET /notification-settings/types — requireStaff. The catalogue without
 * subscriber lists, so a staff session can tell a task from news.
 */
export async function listTypeSummariesHandler(_req: AuthedRequest, res: Response) {
    res.json(await service.listTypeSummaries());
}

/** PUT /notification-settings/:type — requireAdmin. Replaces one type's config + recipient list wholesale. */
export async function updateSettingHandler(req: AuthedRequest, res: Response) {
    const type = req.params.type as NotificationTypeCode;
    const body = req.body as UpdateNotificationSettingBody;
    res.json(await service.updateSetting(type, body, req.user!, req));
}
