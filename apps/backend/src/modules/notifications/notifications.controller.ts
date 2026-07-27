import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import { BroadcastInput, ListAdminNotificationsFilters, ListNotificationsFilters } from "./notifications.types";
import * as service from "./notifications.service";

export async function listMyNotificationsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListNotificationsFilters>(req);
    res.json(await service.listMyNotifications(req.user!.id, filters));
}

export async function unreadCountHandler(req: AuthedRequest, res: Response) {
    res.json(await service.unreadCount(req.user!.id));
}

export async function markReadHandler(req: AuthedRequest, res: Response) {
    res.json(await service.markRead(req.user!.id, req.params.id as string));
}

export async function markAllReadHandler(req: AuthedRequest, res: Response) {
    await service.markAllRead(req.user!.id);
    res.status(204).send();
}

export async function listAllNotificationsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<ListAdminNotificationsFilters>(req);
    res.json(await service.listAllNotifications(filters));
}

export async function broadcastHandler(req: AuthedRequest, res: Response) {
    const result = await service.broadcastNotification(req.body as BroadcastInput, req.user!);
    res.status(201).json(result);
}
