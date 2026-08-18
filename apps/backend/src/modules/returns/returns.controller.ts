import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./returns.service";
import type { ApproveReturnSettlementBody, ListSettlementsQuery } from "./returns.validation";

export async function getReturnDetailHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getReturnDetail(req.params.id as string));
}

export async function approveReturnSettlementHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ApproveReturnSettlementBody;
    res.json(await service.approveReturnSettlement(req.params.id as string, body, req.user!));
}

export async function listSettlementsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listSettlements(validatedQuery<ListSettlementsQuery>(req)));
}
