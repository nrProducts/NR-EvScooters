import { Request, Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { badRequest } from "../../common/AppError";
import * as service from "./payments.service";
import { VerifyPaymentBody } from "./payments.validation";

export async function createOrderForBookingHandler(req: AuthedRequest, res: Response) {
    const result = await service.createOrderForBooking(req.params.id as string, req.user!);
    res.status(201).json(result);
}

export async function createOrderForInvoiceHandler(req: AuthedRequest, res: Response) {
    const result = await service.createOrderForInvoice(req.params.id as string, req.user!);
    res.status(201).json(result);
}

export async function verifyPaymentHandler(req: AuthedRequest, res: Response) {
    const body = req.body as VerifyPaymentBody;
    await service.verifyPayment(body, req.user!);
    res.json({ status: "verified" });
}

/**
 * No requireAuth — Razorpay calls this directly with no bearer token.
 * Protected by signature verification inside handleWebhook instead. Needs
 * the exact raw bytes app.ts's express.json() `verify` callback stashed on
 * req.rawBody; re-serialized JSON would not reproduce an identical signature.
 */
export async function webhookHandler(req: Request, res: Response) {
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw badRequest("Missing request body.");
    const signature = req.get("x-razorpay-signature");
    await service.handleWebhook(rawBody, signature);
    res.json({ status: "ok" });
}
