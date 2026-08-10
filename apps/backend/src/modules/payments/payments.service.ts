import Razorpay from "razorpay";
import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { env } from "../../config/env";
import { badRequest, businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { addDays } from "../../common/dates";
import { notifyUser } from "../notifications/notifications.service";
import { applyRefundWebhookResult } from "../refunds/refunds.service";
import { AuthContext } from "../../types";
import { CreateOrderResult, PaymentPurpose, VerifyPaymentInput } from "./payments.types";

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Razorpay reports method as card/upi/wallet/netbanking/emi — narrower than our payment_method enum. */
function mapGatewayMethod(method: string | null): "card" | "wallet" | "upi" | "cash" | null {
    if (method === "card" || method === "wallet" || method === "upi") return method;
    return null;
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

/**
 * Rider's initial checkout: weekly rent + security deposit in one Razorpay
 * order, split into two invoices (payment_type='rental' / 'deposit') so
 * each is individually reportable. Amount is always computed server-side
 * from the plan's stored price/deposit_amount — never trust a client amount.
 */
export async function createOrderForBooking(bookingId: string, actor: AuthContext): Promise<CreateOrderResult> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, referral_discount_amount, plans(id, price, deposit_amount)")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    // 404 rather than 403 for someone else's booking, same convention as cancelMyBooking.
    if (!booking || booking.user_id !== actor.id) throw notFound("Booking not found.");
    if (booking.status !== "pending_payment") {
        throw conflict("This booking is not awaiting payment.");
    }

    const plan = unwrap<{ id: string; price: number; deposit_amount: number | null }>(booking.plans);
    if (!plan) throw businessRule("This booking has no plan attached.");

    // Net out any qualifying first-booking referral discount (see
    // qualifyReferralIfApplicable in bookings.service.ts) — the rider must
    // never be charged more than what cancelMyBooking's own charge math
    // already treats as "what the rider would actually owe".
    const discount = round2(Number(booking.referral_discount_amount ?? 0));
    const rentalAmount = round2(Math.max(0, Number(plan.price) - discount));
    const depositAmount = round2(Number(plan.deposit_amount ?? env.defaultDepositAmount));
    const totalAmount = round2(rentalAmount + depositAmount);

    const existing = await findReusableOrder(bookingId, "booking_initial");
    if (existing) return existing;

    const razorpay = getRazorpay();
    const gatewayOrder = await razorpay.orders.create({
        amount: rupeesToPaise(totalAmount),
        currency: "INR",
        receipt: `booking_${bookingId}`.slice(0, 40),
        notes: { booking_id: bookingId, purpose: "booking_initial" },
    });

    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
            gateway_order_id: gatewayOrder.id,
            purpose: "booking_initial",
            user_id: actor.id,
            booking_id: bookingId,
            amount: totalAmount,
            currency: "INR",
            status: "created",
        })
        .select("id, gateway_order_id, amount, currency")
        .single();
    if (orderError) throw orderError;

    const today = new Date().toISOString().slice(0, 10);
    const { error: invoiceError } = await supabaseAdmin.from("invoices").insert([
        {
            user_id: actor.id, booking_id: bookingId, payment_order_id: order.id,
            payment_type: "rental", status: "issued", amount_due: rentalAmount,
            due_date: today, payment_status: "pending",
        },
        {
            user_id: actor.id, booking_id: bookingId, payment_order_id: order.id,
            payment_type: "deposit", status: "issued", amount_due: depositAmount,
            due_date: today, payment_status: "pending",
        },
    ]);
    if (invoiceError) throw invoiceError;

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.order_created",
        entityType: "payment_order", entityId: order.id,
        after: { booking_id: bookingId, purpose: "booking_initial", amount: totalAmount },
    });

    return toOrderResult(order);
}

/**
 * Generic "pay this existing invoice" path — reused for a weekly-due invoice
 * (opened once a plan goes DUE) and a damage-settlement invoice (the
 * outstanding amount when damage exceeds the deposit). 'deposit' invoices
 * are never paid through here — they're only ever settled as part of the
 * booking_initial order above.
 */
export async function createOrderForInvoice(invoiceId: string, actor: AuthContext): Promise<CreateOrderResult> {
    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, user_id, booking_id, payment_type, amount_due, payment_status, payment_order_id")
        .eq("id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    if (!invoice || invoice.user_id !== actor.id) throw notFound("Invoice not found.");
    if (invoice.payment_status === "succeeded") throw conflict("This invoice has already been paid.");
    if (invoice.payment_type !== "rental" && invoice.payment_type !== "damage" && invoice.payment_type !== "penalty" && invoice.payment_type !== "other") {
        throw businessRule("This invoice can't be paid directly.");
    }

    const purpose: PaymentPurpose = invoice.payment_type === "damage" ? "damage_settlement" : "weekly_due";
    const amount = round2(Number(invoice.amount_due));

    if (invoice.payment_order_id) {
        const { data: existingOrder, error: existingError } = await supabaseAdmin
            .from("payment_orders")
            .select("id, gateway_order_id, amount, currency")
            .eq("id", invoice.payment_order_id)
            .in("status", ["created", "attempted"])
            .maybeSingle();
        if (existingError) throw existingError;
        if (existingOrder) return toOrderResult(existingOrder);
    }

    const razorpay = getRazorpay();
    const gatewayOrder = await razorpay.orders.create({
        amount: rupeesToPaise(amount),
        currency: "INR",
        receipt: `invoice_${invoiceId}`.slice(0, 40),
        notes: { invoice_id: invoiceId, booking_id: invoice.booking_id ?? "", purpose },
    });

    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
            gateway_order_id: gatewayOrder.id,
            purpose,
            user_id: actor.id,
            booking_id: invoice.booking_id,
            amount,
            currency: "INR",
            status: "created",
        })
        .select("id, gateway_order_id, amount, currency")
        .single();
    if (orderError) throw orderError;

    const { error: linkError } = await supabaseAdmin
        .from("invoices")
        .update({ payment_order_id: order.id })
        .eq("id", invoiceId);
    if (linkError) throw linkError;

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.order_created",
        entityType: "payment_order", entityId: order.id,
        after: { invoice_id: invoiceId, purpose, amount },
    });

    return toOrderResult(order);
}

async function findReusableOrder(bookingId: string, purpose: PaymentPurpose): Promise<CreateOrderResult | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, gateway_order_id, amount, currency")
        .eq("booking_id", bookingId)
        .eq("purpose", purpose)
        .in("status", ["created", "attempted"])
        .maybeSingle();
    if (error) throw error;
    return data ? toOrderResult(data) : null;
}

function toOrderResult(order: { id: string; gateway_order_id: string | null; amount: number | string; currency: string }): CreateOrderResult {
    return {
        orderId: order.id,
        gatewayOrderId: order.gateway_order_id!,
        amount: Number(order.amount),
        currency: order.currency,
        keyId: env.razorpayKeyId,
    };
}

// ---------------------------------------------------------------------------
// Client-side verify callback — UI feedback only. NOT authoritative: the
// webhook (below) is what actually must fire for the system to trust a
// payment; this path exists so the app can show success immediately instead
// of waiting on a webhook round trip.
// ---------------------------------------------------------------------------

export async function verifyPayment(input: VerifyPaymentInput, actor: AuthContext): Promise<void> {
    if (!env.razorpayKeySecret) throw businessRule("Payment gateway is not configured.");

    // Razorpay's own `validatePaymentVerification` helper isn't part of the
    // SDK's typed static surface (only validateWebhookSignature is), so this
    // reproduces it exactly: HMAC-SHA256 of "order_id|payment_id" against the
    // key secret, compared via the same signature-check helper used below
    // for webhooks.
    const valid = Razorpay.validateWebhookSignature(
        `${input.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        env.razorpayKeySecret,
    );
    if (!valid) throw badRequest("Payment could not be verified.");

    const { data: order, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, amount")
        .eq("gateway_order_id", input.razorpay_order_id)
        .maybeSingle();
    if (error) throw error;
    if (!order || order.user_id !== actor.id) throw notFound("Payment order not found.");

    await applyPaymentSuccess({
        paymentOrderId: order.id,
        gatewayPaymentId: input.razorpay_payment_id,
        gatewaySignature: input.razorpay_signature,
        amount: Number(order.amount),
        method: null,
        rawPayload: { source: "verify_callback" },
    });

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.verified",
        entityType: "payment_order", entityId: order.id,
        after: { gateway_payment_id: input.razorpay_payment_id },
    });
}

// ---------------------------------------------------------------------------
// Webhook — authoritative. Every delivery is logged to webhook_events
// (idempotent on gateway_event_id) before any financial effect is applied.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebhookPayload = any;

function extractPrimaryEntity(payload: WebhookPayload): { id?: string } | null {
    const p = payload?.payload;
    if (!p || typeof p !== "object") return null;
    const key = Object.keys(p)[0];
    return key ? (p[key]?.entity ?? null) : null;
}

export async function handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    const signatureValid = !!env.razorpayWebhookSecret
        && !!signatureHeader
        && Razorpay.validateWebhookSignature(rawBody.toString("utf8"), signatureHeader, env.razorpayWebhookSecret);

    let payload: WebhookPayload;
    try {
        payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
        throw badRequest("Malformed webhook payload.");
    }

    const eventType: string = payload.event ?? "unknown";
    const entity = extractPrimaryEntity(payload);
    const gatewayEventId: string = payload.id
        ?? `${eventType}:${entity?.id ?? "unknown"}:${payload.created_at ?? "unknown"}`;

    const { data: inserted, error: insertError } = await supabaseAdmin
        .from("webhook_events")
        .insert({ gateway_event_id: gatewayEventId, event_type: eventType, signature_valid: signatureValid, payload })
        .select("id")
        .maybeSingle();

    if (insertError) {
        // Unique violation on gateway_event_id: Razorpay redelivered an event
        // already recorded. Already processed (or being processed) — no-op.
        if (insertError.code === "23505") return;
        throw insertError;
    }

    if (!signatureValid) {
        await supabaseAdmin.from("webhook_events").update({ error: "invalid_signature" }).eq("id", inserted!.id);
        throw badRequest("Invalid webhook signature.");
    }

    try {
        await dispatchWebhookEvent(eventType, payload);
        await supabaseAdmin
            .from("webhook_events")
            .update({ processed: true, processed_at: new Date().toISOString() })
            .eq("id", inserted!.id);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabaseAdmin.from("webhook_events").update({ error: message }).eq("id", inserted!.id);
        throw err;
    }

    await writeAudit({
        actorId: null, targetUserId: null, action: "payment.webhook_received",
        entityType: "webhook_event", entityId: inserted!.id,
        after: { event_type: eventType },
    });
}

async function dispatchWebhookEvent(eventType: string, payload: WebhookPayload): Promise<void> {
    switch (eventType) {
        case "payment.captured": {
            const payment = payload.payload?.payment?.entity;
            if (!payment) return;
            const order = await findOrderByGatewayOrderId(payment.order_id);
            if (!order) return; // Not one of ours (or already deleted) — nothing to apply.
            await applyPaymentSuccess({
                paymentOrderId: order.id,
                gatewayPaymentId: payment.id,
                gatewaySignature: null,
                amount: Number(payment.amount) / 100,
                method: payment.method ?? null,
                rawPayload: payment,
            });
            break;
        }
        case "payment.authorized": {
            // Informational only — 'captured' is what actually applies the
            // financial effect. An authorized-but-not-yet-captured payment
            // isn't settled money yet.
            const payment = payload.payload?.payment?.entity;
            if (!payment) return;
            await supabaseAdmin
                .from("payment_orders")
                .update({ status: "attempted" })
                .eq("gateway_order_id", payment.order_id)
                .eq("status", "created");
            break;
        }
        case "payment.failed": {
            const payment = payload.payload?.payment?.entity;
            if (!payment) return;
            await applyPaymentFailure(payment.order_id, payment.error_description ?? "Payment failed");
            break;
        }
        // 'refund.created' is informational only (we already know — we
        // initiated it via refunds.service.ts's processRefund) — nothing to
        // apply. 'refund.processed'/'refund.failed' are the authoritative,
        // idempotent confirmation in case the synchronous gateway response
        // to processRefund was lost (network blip, process restart mid-call).
        case "refund.created":
            break;
        case "refund.processed": {
            const refund = payload.payload?.refund?.entity;
            if (!refund) return;
            await applyRefundWebhookResult(refund.id, "success");
            break;
        }
        case "refund.failed": {
            const refund = payload.payload?.refund?.entity;
            if (!refund) return;
            await applyRefundWebhookResult(refund.id, "failed", "Refund failed at the gateway.");
            break;
        }
        default:
            break;
    }
}

async function findOrderByGatewayOrderId(
    gatewayOrderId: string,
): Promise<{ id: string; user_id: string; booking_id: string | null; purpose: PaymentPurpose } | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, booking_id, purpose")
        .eq("gateway_order_id", gatewayOrderId)
        .maybeSingle();
    if (error) throw error;
    return data as { id: string; user_id: string; booking_id: string | null; purpose: PaymentPurpose } | null;
}

async function applyPaymentFailure(gatewayOrderId: string, reason: string): Promise<void> {
    const order = await findOrderByGatewayOrderId(gatewayOrderId);
    if (!order) return;

    const { data: updated, error } = await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", order.id)
        .in("status", ["created", "attempted"])
        .select("id")
        .maybeSingle();
    if (error) throw error;
    if (!updated) return; // Already paid or already failed — no-op.

    await supabaseAdmin
        .from("invoices")
        .update({ payment_status: "failed" })
        .eq("payment_order_id", order.id)
        .eq("payment_status", "pending");

    await writeAudit({
        actorId: null, targetUserId: order.user_id, action: "payment.failed",
        entityType: "payment_order", entityId: order.id, after: { reason },
    });

    await notifyUser(order.user_id, {
        template: "payment_failed", title: "Payment Failed",
        body: "Payment failed. Please try again.", screen: "payments",
    });
}

// ---------------------------------------------------------------------------
// The single idempotent core every successful payment (verify OR webhook)
// runs through. gateway_payment_id's unique constraint on
// payment_transactions is what makes "duplicate webhook must not
// double-activate a plan/booking" true regardless of how many times this
// function is called for the same real payment.
// ---------------------------------------------------------------------------

interface ApplyPaymentSuccessInput {
    paymentOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string | null;
    amount: number;
    method: string | null;
    rawPayload: unknown;
}

export async function applyPaymentSuccess(input: ApplyPaymentSuccessInput): Promise<void> {
    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, booking_id, purpose")
        .eq("id", input.paymentOrderId)
        .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return; // Defensive no-op — shouldn't happen, there's nothing to apply against.

    const { error: txnError } = await supabaseAdmin.from("payment_transactions").insert({
        payment_order_id: order.id,
        gateway_payment_id: input.gatewayPaymentId,
        gateway_signature: input.gatewaySignature,
        status: "succeeded",
        amount: input.amount,
        method: input.method,
        raw_payload: input.rawPayload as object,
    });
    if (txnError) {
        if (txnError.code === "23505") return; // Already applied — idempotent no-op.
        throw txnError;
    }

    await supabaseAdmin
        .from("payment_orders")
        .update({ status: "paid" })
        .eq("id", order.id)
        .in("status", ["created", "attempted"]);

    await supabaseAdmin
        .from("invoices")
        .update({
            status: "paid",
            payment_status: "succeeded",
            paid_at: new Date().toISOString(),
            payment_method: mapGatewayMethod(input.method),
            gateway_ref: input.gatewayPaymentId,
        })
        .eq("payment_order_id", order.id)
        .eq("payment_status", "pending");

    if (order.purpose === "booking_initial" && order.booking_id) {
        await applyBookingInitialSuccess(order.booking_id, order.user_id);
    } else if (order.purpose === "weekly_due" && order.booking_id) {
        await applyWeeklyDueSuccess(order.booking_id);
    }
    // 'damage_settlement' / 'other': the invoice update above is sufficient.

    await notifyUser(order.user_id, {
        template: "payment_success", title: "Payment Successful",
        body: "Payment successful. Your rental is active.", screen: "payments",
    });
}

async function applyBookingInitialSuccess(bookingId: string, userId: string): Promise<void> {
    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", bookingId)
        .eq("status", "pending_payment")
        .select("id")
        .maybeSingle();
    if (error) throw error;
    if (!updated) return; // Already confirmed by a prior delivery of this payment.

    const { data: depositInvoice, error: depositInvoiceError } = await supabaseAdmin
        .from("invoices")
        .select("amount_due")
        .eq("booking_id", bookingId)
        .eq("payment_type", "deposit")
        .maybeSingle();
    if (depositInvoiceError) throw depositInvoiceError;

    const { error: depositError } = await supabaseAdmin.from("deposits").insert({
        booking_id: bookingId,
        amount: depositInvoice ? Number(depositInvoice.amount_due) : env.defaultDepositAmount,
        status: "held",
        held_at: new Date().toISOString(),
    });
    // A unique violation means the deposit row already exists (another
    // delivery of the same payment got here first) — safe to ignore.
    if (depositError && depositError.code !== "23505") throw depositError;

    await writeAudit({
        actorId: null, targetUserId: userId, action: "booking.payment_completed",
        entityType: "booking", entityId: bookingId, after: { status: "confirmed" },
    });
    await writeAudit({
        actorId: null, targetUserId: userId, action: "deposit.held",
        entityType: "deposit", entityId: bookingId, after: { status: "held" },
    });
}

/**
 * A booking's plan starts DUE (not active) once its current period lapses
 * unpaid — see the payment-overdue-sweep job. Paying that invoice returns it
 * to active and rolls the due date forward by exactly one period, anchored
 * to the period that was just paid for (not "today"), so the weekly cadence
 * never drifts even if a rider catches up a day or two late.
 */
async function applyWeeklyDueSuccess(bookingId: string): Promise<void> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, plan_status, next_due_at, plan_duration_days")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!booking || !booking.next_due_at || !booking.plan_duration_days) return;
    if (booking.plan_status !== "due") return; // Already advanced by a prior delivery.

    const newPeriodStart = booking.next_due_at;
    const newNextDueAt = addDays(newPeriodStart, booking.plan_duration_days);

    await supabaseAdmin
        .from("bookings")
        .update({ plan_status: "active", current_period_start: newPeriodStart, next_due_at: newNextDueAt })
        .eq("id", bookingId)
        .eq("plan_status", "due");

    await writeAudit({
        actorId: null, targetUserId: null, action: "plan.updated",
        entityType: "booking", entityId: bookingId,
        after: { plan_status: "active", next_due_at: newNextDueAt },
    });
}
