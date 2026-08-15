import { Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { validatedQuery } from "../../middleware/validate.middleware";
import * as service from "./refunds.service";
import { InitiateRefundBody, ListRefundsQuery } from "./refunds.validation";

export async function listRefundsHandler(req: AuthedRequest, res: Response) {
    const { status, refundType, bookingId, ...page } = validatedQuery<ListRefundsQuery>(req);
    res.json(await service.listRefunds({ ...page, status, refundType, bookingId }));
}

export async function getRefundHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getRefundById(req.params.id as string));
}

export async function createRefundHandler(req: AuthedRequest, res: Response) {
    const body = req.body as InitiateRefundBody;
    const refund = await service.refundDeposit(body.deposit_id, req.user!);
    res.status(201).json(refund);
}

/** Also doubles as "Approve" for a refund still at status='pending' — see processRefund's doc comment. */
export async function retryRefundHandler(req: AuthedRequest, res: Response) {
    res.json(await service.processRefund(req.params.id as string, req.user!));
}
