import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./returns.service";
import type { ApproveReturnSettlementBody, ListSettlementsQuery, SaveInspectionBody } from "./returns.validation";

export async function getReturnDetailHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getReturnDetail(req.params.id as string));
}

export async function saveInspectionHandler(req: AuthedRequest, res: Response) {
    const body = req.body as SaveInspectionBody;
    res.json(await service.saveInspection(req.params.id as string, body, req.user!));
}

export async function getPaymentReviewHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getPaymentReview(req.params.id as string));
}

export async function verifyReturnPaymentHandler(req: AuthedRequest, res: Response) {
    res.json(await service.verifyReturnPayment(req.params.id as string, req.user!));
}

export async function approveReturnSettlementHandler(req: AuthedRequest, res: Response) {
    const body = req.body as ApproveReturnSettlementBody;
    res.json(await service.approveReturnSettlement(req.params.id as string, body, req.user!));
}

export async function listSettlementsHandler(req: AuthedRequest, res: Response) {
    res.json(await service.listSettlements(validatedQuery<ListSettlementsQuery>(req)));
}
