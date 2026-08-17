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

/**
 * Creates (or reuses) the pending refund row only — never auto-processes it.
 * Deposit Refund & Damage Deduction Phase 1: every refund, deposit or
 * cancellation, now waits at status='pending' until an admin explicitly
 * approves it via retryRefundHandler below.
 */
export async function createRefundHandler(req: AuthedRequest, res: Response) {
    const body = req.body as InitiateRefundBody;
    const refund = await service.initiateRefund(body.deposit_id, req.user!);
    res.status(201).json(refund);
}

/** Full settlement breakdown for the admin approval screen — see refunds.service.ts's getRefundSettlement. */
export async function getRefundSettlementHandler(req: AuthedRequest, res: Response) {
    res.json(await service.getRefundSettlement(req.params.id as string));
}

/** Doubles as "Approve & Process Refund" for a refund still at status='pending' (either refund_type) — see processRefund's doc comment. */
export async function retryRefundHandler(req: AuthedRequest, res: Response) {
    res.json(await service.processRefund(req.params.id as string, req.user!));
}
