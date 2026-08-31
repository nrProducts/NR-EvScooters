import { Request, Response } from "express";
import { AuthedRequest } from "../../middleware/auth.middleware";
import { badRequest } from "../../common/AppError";
import * as service from "./payments.service";
import { CreateBookingOrderBody, VerifyPaymentBody } from "./payments.validation";

/**
 * Pay-first rider checkout — creates a payment_orders "booking intent" only.
 * The booking itself is created when this order's payment captures.
 */
export async function createBookingOrderHandler(req: AuthedRequest, res: Response) {
    const result = await service.createBookingOrder(req.body as CreateBookingOrderBody, req.user!);
    res.status(201).json(result);
}

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
    // Stable across redeliveries — the idempotency key for the whole handler.
    const eventId = req.get("x-razorpay-event-id");
    await service.handleWebhook(rawBody, signature, eventId);
    res.json({ status: "ok" });
}

/**
 * The bill for a plan, before any booking exists. Read-only.
 *
 * Deliberately NOT authenticated against a booking: the rider is still
 * choosing, so there is nothing to own yet. It exposes only plan pricing,
 * which the catalogue already shows.
 */
export async function quotePlanHandler(req: AuthedRequest, res: Response) {
    const { planId } = req.params as { planId: string };
    const startDay = (req.query.start_day as string | undefined) || undefined;
    res.json(await service.quotePlan(planId, startDay));
}
