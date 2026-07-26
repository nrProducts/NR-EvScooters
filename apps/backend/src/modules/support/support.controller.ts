import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./support.service";
import {
    CreateSupportBody, SupportHistoryQuery, SupportQueueQuery, UpdateSupportBody,
} from "./support.validation";

// --- rider -----------------------------------------------------------------

export async function createSupportRequestHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateSupportBody;
    const request = await service.createSupportRequest(req.user!.id, body);
    res.status(201).json(request);
}

export async function myRequestsHandler(req: AuthedRequest, res: Response) {
    const page = validatedQuery<SupportHistoryQuery>(req);
    res.json(await service.getMyRequests(req.user!.id, page));
}

// --- staff -------------------------------------------------------------

export async function supportQueueHandler(req: AuthedRequest, res: Response) {
    const { status, ...page } = validatedQuery<SupportQueueQuery>(req);
    res.json(await service.listSupportQueue({ ...page, status }));
}

export async function supportDetailHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getSupportDetail(req.params.id as string));
}

export async function updateSupportRequestHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateSupportBody;
    res.json(await service.updateSupportRequest(req.params.id as string, body, req.user!));
}
