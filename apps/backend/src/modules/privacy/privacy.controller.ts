import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./privacy.service";
import type { DpRequestType, ListPrivacyRequestsFilters } from "./privacy.types";
import type {
    CreateRequestBody, ExecuteErasureBody, UpdateNomineeBody, UpdateRequestBody,
} from "./privacy.validation";

// --- rider ---------------------------------------------------------------

export async function createMyRequestHandler(req: AuthedRequest, res: Response) {
    const body = req.body as CreateRequestBody;
    res.status(201).json(await service.createRequest(req.user!.id, body, req));
}

export async function listMyRequestsHandler(req: AuthedRequest, res: Response) {
    const filters = validatedQuery<{ page: number; pageSize: number; type?: DpRequestType }>(req);
    res.json(await service.listMyRequests(req.user!.id, filters));
}

export async function getMyRequestHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMyRequest(req.user!.id, req.params.id as string));
}

export async function cancelMyRequestHandler(req: AuthedRequest, res: Response) {
    res.json(await service.cancelMyRequest(req.user!.id, req.params.id as string, req));
}

export async function getMySummaryHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getMySummary(req.user!.id));
}

export async function getMyNomineeHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getNominee(req.user!.id));
}

export async function updateMyNomineeHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateNomineeBody;
    res.json(await service.updateNominee(req.user!.id, body, req));
}

export async function deleteMyNomineeHandler(req: AuthedRequest, res: Response) {
    await service.clearNominee(req.user!.id, req);
    res.status(204).send();
}

// --- staff / admin -------------------------------------------------------

export async function listRequestsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listRequests(validatedQuery<ListPrivacyRequestsFilters>(req)));
}

export async function getRequestHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getRequest(req.params.id as string));
}

export async function updateRequestHandler(req: AuthedRequest, res: Response) {
    const body = req.body as UpdateRequestBody;
    res.json(await service.updateRequest(req.params.id as string, body, req.user!, req));
}

export async function rejectRequestHandler(req: AuthedRequest, res: Response) {
    const { reason } = req.body as { reason: string };
    res.json(await service.rejectRequest(req.params.id as string, reason, req.user!, req));
}

export async function approveErasureHandler(req: AuthedRequest, res: Response) {
    res.json(await service.approveErasure(req.params.id as string, req.user!, req));
}

export async function executeErasureHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ExecuteErasureBody;
    res.json(await service.executeErasure(req.params.id as string, body, req.user!, req));
}

/** Reads a rider's s.11 summary on their behalf, for a request that arrived off-app. */
export async function summaryForUserHandler(req: AuthedRequest, res: Response) {
    res.json(await service.summaryForUser(req.params.userId as string, req.user!, req));
}
