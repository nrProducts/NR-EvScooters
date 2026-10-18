import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { RemoveWebPushSubscriptionInput, SaveWebPushSubscriptionInput } from "./web-push.types";
import * as service from "./web-push.service";

export async function configHandler(_req: AuthedRequest, res: Response) {
    res.json(service.getWebPushConfig());
}

export async function saveSubscriptionHandler(req: AuthedRequest, res: Response) {
    await service.saveSubscription(
        req.user!.id,
        req.body as SaveWebPushSubscriptionInput,
        req.get("user-agent") ?? undefined,
    );
    res.status(204).send();
}

export async function removeSubscriptionHandler(req: AuthedRequest, res: Response) {
    const { endpoint } = req.body as RemoveWebPushSubscriptionInput;
    await service.removeSubscription(req.user!.id, endpoint);
    res.status(204).send();
}
