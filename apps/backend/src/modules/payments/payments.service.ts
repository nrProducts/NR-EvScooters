import { randomUUID } from "node:crypto";
import Razorpay from "razorpay";
import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { env } from "../../config/env";
import { badRequest, businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { addDays, businessToday } from "../../common/dates";
import { computeLateRenewalFee } from "./renewalFee";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { applyRefundWebhookResult } from "../refunds/refunds.service";
import { AuthContext } from "../../types";
import { CreateOrderResult, VerifyPaymentInput } from "./payments.types";

/**
 * Payments.
 *
 * `payment_orders` changed shape in a way that reorders the whole flow: it
 * has `invoice_id` NOT NULL and no `purpose`/`booking_id`. **One order pays
 * exactly one invoice.** The old order carried a free-text purpose and could
 * be claimed to have settled any number of invoices; the money and the bill
 * are now the same fact.
 *
 * ── A deviation from the migration plan, and why ──────────────────────────
 *
 * The plan says the subscription is created "on payment capture". It cannot
 * be, and the constraint chain is what says so:
 *
 *     payment_orders.invoice_id      NOT NULL
 *     invoices.subscription_id       NOT NULL
 *
 * To take a payment you need an order; an order needs an invoice; an invoice
 * needs a subscription. So the subscription, its deposit, period #1 and the
 * opening invoice are all created when CHECKOUT STARTS, and capture is what
 * CONFIRMS them — booking to `confirmed`, deposit to `held`, and the
 * allocation written.
 *
 * That leaves one thing to be aware of: an abandoned checkout leaves an
 * `active` subscription with an unpaid invoice behind it, because
 * `subscription_status` has no `pending` value. The booking-expiry sweep
 * (Stage 9) has to cancel those alongside releasing the vehicle hold —
 * `cancelAbandonedSubscription` below is what it should call.
 */

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Razorpay reports card/upi/wallet/netbanking/emi — `payment_method` has five. */
function mapGatewayMethod(method: string | null): "card" | "wallet" | "upi" | "netbanking" | "cash" | null {
    if (method === "card" || method === "wallet" || method === "upi" || method === "netbanking") return method;
    return null;
}

/**
 * No RAZORPAY_KEY_ID/SECRET set yet. Order creation falls back to settling
 * immediately with temp data instead of calling out, so the flow stays
 * testable until real keys are supplied.
 */
function isGatewayConfigured(): boolean {
    return !!env.razorpayKeyId && !!env.razorpayKeySecret;
}

// ---------------------------------------------------------------------------
// Order creation
// ---------------------------------------------------------------------------

/**
 * Rider's initial checkout.
 *
 * Creates the whole commercial agreement — subscription, deposit, period #1,
 * opening invoice — and then one order against that invoice. Everything here
 * is idempotent on re-entry, so a rider who abandons and returns reuses what
 * already exists rather than getting a second subscription.
 */
export async function createOrderForBooking(
    bookingId: string,
    actor: AuthContext,
): Promise<CreateOrderResult> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select(`
            id, user_id, status, requested_start_on,
            plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot,
            plans(id, billing_period)
        `)
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    // 404 rather than 403 for someone else's booking, same convention as cancelMyBooking.
    if (!booking || booking.user_id !== actor.id) throw notFound("Booking not found.");
    if (booking.status !== "pending_payment") throw conflict("This booking is not awaiting payment.");

    const plan = unwrap<{ id: string; billing_period: "daily" | "weekly" | "monthly" }>(booking.plans);
    if (!plan) throw businessRule("This booking has no plan attached.");

    const subscriptionId = await ensureSubscription(booking, plan);
    const invoiceId = await ensureInitialInvoice(subscriptionId, actor.id);

    return createOrderForInvoiceInternal(invoiceId, actor);
}

/**
 * The subscription for this booking, creating it if this is the first
 * checkout attempt.
 *
 * `subscriptions.booking_id` is unique, so a concurrent second attempt loses
 * the insert and re-reads — which is why the 23505 branch is a read, not an
 * error.
 */
async function ensureSubscription(
    booking: {
        id: string; user_id: string; requested_start_on: string;
        plan_price_snapshot: number | string; duration_days_snapshot: number;
        deposit_amount_snapshot: number | string;
    },
    plan: { id: string; billing_period: "daily" | "weekly" | "monthly" },
): Promise<string> {
    const { data: existing, error: readError } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();
    if (readError) throw readError;
    if (existing) return existing.id;

    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .insert({
            booking_id: booking.id,
            user_id: booking.user_id,
            plan_id: plan.id,
            // Snapshots carried across from the booking so the agreement is
            // self-describing: a later repricing cannot rewrite what was agreed.
            // Postgres `numeric` round-trips through PostgREST as a string.
            plan_price_snapshot: Number(booking.plan_price_snapshot),
            duration_days_snapshot: booking.duration_days_snapshot,
            deposit_amount_snapshot: Number(booking.deposit_amount_snapshot),
            billing_period_snapshot: plan.billing_period,
            started_on: booking.requested_start_on,
            status: "active",
        })
        .select("id")
        .single();
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            const { data: raced } = await supabaseAdmin
                .from("subscriptions").select("id").eq("booking_id", booking.id).single();
            return raced!.id;
        }
        throw error;
    }

    const subscriptionId = data.id;
    const startsOn = booking.requested_start_on;
    const endsOn = addDays(startsOn, booking.duration_days_snapshot - 1);

    const { error: periodError } = await supabaseAdmin.from("subscription_periods").insert({
        subscription_id: subscriptionId,
        sequence_number: 1,
        starts_on: startsOn,
        ends_on: endsOn,
        due_on: endsOn,
        base_amount_snapshot: Number(booking.plan_price_snapshot),
        status: "current",
    });
    if (periodError && (periodError as { code?: string }).code !== "23505") throw periodError;

    // Held only once the money actually arrives — see applyPaymentSuccess.
    const { error: depositError } = await supabaseAdmin.from("deposits").insert({
        subscription_id: subscriptionId,
        amount: Number(booking.deposit_amount_snapshot),
        status: "pending",
    });
    if (depositError && (depositError as { code?: string }).code !== "23505") throw depositError;

    return subscriptionId;
}

/**
 * The opening invoice, built by the database.
 *
 * `generate_period_invoice()` resolves the applicable pricing rules, writes
 * the `subscription_adjustments` and then the invoice and its items — so the
 * transaction fee and any welcome discount are applied by the same code path
 * that will handle every later renewal, rather than being assembled here.
 */
async function ensureInitialInvoice(subscriptionId: string, userId: string): Promise<string> {
    const { data: period, error: periodError } = await supabaseAdmin
        .from("v_subscription_current_period")
        .select("subscription_period_id")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (periodError) throw periodError;
    if (!period?.subscription_period_id) {
        throw businessRule("This subscription has no billing period to invoice.");
    }

    const { data, error } = await supabaseAdmin.rpc("generate_period_invoice", {
        p_subscription_period_id: period.subscription_period_id,
    });
    if (error) throw error;

    const invoiceId = data as string;

    // The deposit is billed alongside the first period only. It is not a
    // pricing rule — it is refundable, so it can never be revenue.
    const { data: existingDeposit, error: itemReadError } = await supabaseAdmin
        .from("invoice_items")
        .select("id")
        .eq("invoice_id", invoiceId)
        .eq("item_type", "deposit")
        .maybeSingle();
    if (itemReadError) throw itemReadError;

    if (!existingDeposit) {
        const { data: deposit } = await supabaseAdmin
            .from("deposits").select("amount").eq("subscription_id", subscriptionId).maybeSingle();
        const depositAmount = Number(deposit?.amount ?? env.defaultDepositAmount);

        if (depositAmount > 0) {
            const { data: lastItem } = await supabaseAdmin
                .from("invoice_items")
                .select("line_number")
                .eq("invoice_id", invoiceId)
                .order("line_number", { ascending: false })
                .limit(1)
                .maybeSingle();

            const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
                invoice_id: invoiceId,
                item_type: "deposit",
                description: "Refundable security deposit",
                line_number: (lastItem?.line_number ?? 0) + 1,
                quantity: 1,
                unit_amount: depositAmount,
                amount: depositAmount,
            });
            if (itemError) throw itemError;

            const { data: invoice } = await supabaseAdmin
                .from("invoices").select("subtotal_amount, total_amount").eq("id", invoiceId).single();
            const { error: totalError } = await supabaseAdmin
                .from("invoices")
                .update({
                    subtotal_amount: round2(Number(invoice!.subtotal_amount) + depositAmount),
                    total_amount: round2(Number(invoice!.total_amount) + depositAmount),
                })
                .eq("id", invoiceId);
            if (totalError) throw totalError;
        }
    }

    void userId;
    return invoiceId;
}

/**
 * "Pay this invoice" — the only order-creation path there is now, since every
 * order names an invoice.
 */
export async function createOrderForInvoice(
    invoiceId: string,
    actor: AuthContext,
): Promise<CreateOrderResult> {
    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, user_id, status, purpose, due_on, total_amount, subscription_id")
        .eq("id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    if (!invoice || invoice.user_id !== actor.id) throw notFound("Invoice not found.");
    if (invoice.status === "void") throw businessRule("This invoice has been voided.");

    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
    if (balanceError) throw balanceError;
    if (balance?.is_paid) throw conflict("This invoice has already been paid.");

    return createOrderForInvoiceInternal(invoiceId, actor);
}

async function createOrderForInvoiceInternal(
    invoiceId: string,
    actor: AuthContext,
): Promise<CreateOrderResult> {
    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, purpose, due_on, subscription_id")
        .eq("id", invoiceId)
        .single();
    if (error) throw error;

    // What is still OWED, from the allocations — not the invoice total. A
    // part-paid invoice must not ask for the whole amount again.
    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("balance_amount")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
    if (balanceError) throw balanceError;

    // A late fee applies to a period renewal only, computed fresh every time
    // so a toggled setting takes effect immediately.
    const { lateFee } = invoice.purpose === "subscription_period" && invoice.due_on
        ? await computeLateRenewalFee(invoice.subscription_id, invoice.due_on)
        : { lateFee: 0 };

    const amount = round2(Number(balance?.balance_amount ?? 0) + lateFee);
    if (amount <= 0) throw conflict("This invoice has already been paid.");

    const existing = await findReusableOrder(invoiceId);
    if (existing) return existing;

    const configured = isGatewayConfigured();
    const gatewayOrderId = configured
        ? (await getRazorpay().orders.create({
            amount: rupeesToPaise(amount),
            currency: "INR",
            receipt: `invoice_${invoiceId}`.slice(0, 40),
            notes: { invoice_id: invoiceId, purpose: invoice.purpose },
        })).id
        : `mock_order_${randomUUID()}`;

    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
            gateway_order_id: gatewayOrderId,
            invoice_id: invoiceId,
            user_id: actor.id,
            amount,
            currency: "INR",
            status: "created",
            // NOT NULL, and the point of it: a retried checkout for the same
            // invoice and amount must not create a second order.
            idempotency_key: `invoice:${invoiceId}:${amount}`,
        })
        .select("id, gateway_order_id, amount, currency")
        .single();
    if (orderError) {
        if ((orderError as { code?: string }).code === "23505") {
            const reused = await findReusableOrder(invoiceId);
            if (reused) return reused;
        }
        throw orderError;
    }

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.order_created",
        entityType: "payment_order", entityId: order.id,
        after: { invoice_id: invoiceId, purpose: invoice.purpose, amount, late_fee: lateFee },
    });

    if (!configured) {
        await applyPaymentSuccess({
            paymentOrderId: order.id,
            gatewayPaymentId: `mock_payment_${randomUUID()}`,
            gatewaySignature: null,
            amount,
            method: null,
            rawPayload: { source: "mock_mode" },
        });
        return toOrderResult(order, true);
    }

    return toOrderResult(order);
}

async function findReusableOrder(invoiceId: string): Promise<CreateOrderResult | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, gateway_order_id, amount, currency")
        .eq("invoice_id", invoiceId)
        .in("status", ["created", "attempted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data ? toOrderResult(data) : null;
}

function toOrderResult(
    order: { id: string; gateway_order_id: string | null; amount: number | string; currency: string },
    mock = false,
): CreateOrderResult {
    return {
        orderId: order.id,
        gatewayOrderId: order.gateway_order_id!,
        amount: Number(order.amount),
        currency: order.currency,
        keyId: env.razorpayKeyId,
        mock,
    };
}

// ---------------------------------------------------------------------------
// Client-side verify callback — UI feedback only. NOT authoritative.
// ---------------------------------------------------------------------------

export async function verifyPayment(input: VerifyPaymentInput, actor: AuthContext): Promise<void> {
    if (!env.razorpayKeySecret) throw businessRule("Payment gateway is not configured.");

    const valid = Razorpay.validateWebhookSignature(
        `${input.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        env.razorpayKeySecret,
    );
    if (!valid) throw badRequest("Payment signature verification failed.");

    const order = await findOrderByGatewayOrderId(input.razorpay_order_id);
    if (!order) throw notFound("Payment order not found.");
    if (order.user_id !== actor.id) throw notFound("Payment order not found.");

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
// Webhook — the authoritative path.
// ---------------------------------------------------------------------------

interface WebhookPayload {
    payload?: {
        payment?: { entity?: Record<string, unknown> };
        refund?: { entity?: Record<string, unknown> };
    };
}

export async function handleWebhook(
    rawBody: Buffer,
    signatureHeader: string | undefined,
): Promise<void> {
    if (!env.razorpayWebhookSecret) throw businessRule("Webhook secret is not configured.");
    if (!signatureHeader) throw badRequest("Missing webhook signature.");

    const valid = Razorpay.validateWebhookSignature(
        rawBody.toString("utf8"),
        signatureHeader,
        env.razorpayWebhookSecret,
    );
    if (!valid) throw badRequest("Webhook signature verification failed.");

    const body = JSON.parse(rawBody.toString("utf8")) as WebhookPayload & {
        event?: string; id?: string;
    };
    const eventType = body.event ?? "unknown";
    const eventId = body.id ?? randomUUID();

    // The unique index on gateway_event_id is what makes a redelivered
    // webhook a no-op rather than a double-apply.
    //
    // "Seen" is not the same as "processed", and conflating the two lost
    // money. This row is inserted and committed BEFORE dispatch, so a
    // dispatch that threw left the event recorded with `processed_at` null —
    // and the redelivery that Razorpay then sent hit 23505 here and returned
    // early as already-handled. The payment stayed captured, the
    // `payment_transactions` row stayed written, and the allocation was
    // never made, forever, with nothing retrying it.
    //
    // So a conflict now re-reads the row and only short-circuits if the
    // earlier attempt actually finished. Re-dispatching an unfinished one is
    // safe: every effect downstream is idempotent on
    // `gateway_payment_id` / `(subscription_id, sequence_number)` / the
    // allocation's own uniqueness. See docs/final-system-audit (finding H3).
    let eventRowId: string;
    const { data: inserted, error } = await supabaseAdmin
        .from("payment_webhook_events")
        .insert({
            gateway: "razorpay",
            gateway_event_id: eventId,
            event_type: eventType,
            payload: body as unknown as Record<string, unknown>,
        } as never)
        .select("id")
        .maybeSingle();

    if (error) {
        if ((error as { code?: string }).code !== "23505") throw error;

        const { data: existing, error: readError } = await supabaseAdmin
            .from("payment_webhook_events")
            .select("id, processed_at")
            .eq("gateway", "razorpay")
            .eq("gateway_event_id", eventId)
            .maybeSingle();
        if (readError) throw readError;

        // Genuinely already done, or the row vanished — nothing to redo.
        if (!existing || existing.processed_at) return;

        console.warn("[payments] reprocessing a webhook that never completed", {
            eventId, eventType,
        });
        eventRowId = existing.id;
    } else {
        eventRowId = inserted!.id;

        await writeAudit({
            actorId: null, targetUserId: null, action: "payment.webhook_received",
            entityType: "payment_webhook_event", entityId: eventRowId,
            after: { event: eventType },
        });
    }

    await dispatchWebhookEvent(eventType, body);

    // Only now is the event finished. Anything that threw above leaves this
    // null, which is both the retry signal for a redelivery and the query
    // reconciliation should run: `payment_webhook_events where processed_at
    // is null and created_at < now() - interval '1 hour'` is the list of
    // payments that were taken and not applied.
    await supabaseAdmin
        .from("payment_webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", eventRowId);
}

async function dispatchWebhookEvent(eventType: string, payload: WebhookPayload): Promise<void> {
    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;

    if (eventType === "payment.captured" && payment) {
        const order = await findOrderByGatewayOrderId(String(payment.order_id));
        if (!order) return;
        await applyPaymentSuccess({
            paymentOrderId: order.id,
            gatewayPaymentId: String(payment.id),
            gatewaySignature: null,
            amount: Number(payment.amount) / 100,
            method: (payment.method as string) ?? null,
            rawPayload: payment,
        });
        return;
    }

    if (eventType === "payment.failed" && payment) {
        await applyPaymentFailure(String(payment.order_id), String(payment.error_description ?? "Payment failed."));
        return;
    }

    if (eventType === "refund.processed" && refund) {
        await applyRefundWebhookResult(String(refund.id), "success");
        return;
    }

    if (eventType === "refund.failed" && refund) {
        await applyRefundWebhookResult(
            String(refund.id), "failed", String(refund.error_description ?? "Refund failed."),
        );
    }
}

async function findOrderByGatewayOrderId(
    gatewayOrderId: string,
): Promise<{ id: string; user_id: string; amount: number | string } | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, amount")
        .eq("gateway_order_id", gatewayOrderId)
        .maybeSingle();
    if (error) throw error;
    return data ?? null;
}

async function applyPaymentFailure(gatewayOrderId: string, reason: string): Promise<void> {
    const order = await findOrderByGatewayOrderId(gatewayOrderId);
    if (!order) return;

    await supabaseAdmin
        .from("payment_orders")
        .update({ status: "failed" })
        .eq("id", order.id)
        .in("status", ["created", "attempted"]);

    await writeAudit({
        actorId: null, targetUserId: order.user_id, action: "payment.failed",
        entityType: "payment_order", entityId: order.id, after: { reason },
    });

    await notifyUser(order.user_id, {
        template: "payment_failed",
        title: "Payment Failed",
        body: `Your payment could not be completed: ${reason}`,
        screen: "payments",
    });
}

// ---------------------------------------------------------------------------
// The idempotent core every successful payment runs through.
// ---------------------------------------------------------------------------

interface ApplyPaymentSuccessInput {
    paymentOrderId: string;
    gatewayPaymentId: string;
    gatewaySignature: string | null;
    amount: number;
    method: string | null;
    rawPayload: unknown;
}

/**
 * `gateway_payment_id`'s unique constraint is what makes "a redelivered
 * webhook must not double-apply" true however many times this is called.
 *
 * The invoice is no longer marked paid: paid-ness is `v_invoice_balances`,
 * derived from the allocations written here. That is the substantive change —
 * there is no `payment_status` column to get out of step with the money.
 */
export async function applyPaymentSuccess(input: ApplyPaymentSuccessInput): Promise<void> {
    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, invoice_id, invoices(purpose, subscription_id, subscription_period_id, total_amount)")
        .eq("id", input.paymentOrderId)
        .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return; // Defensive no-op.

    const invoice = unwrap<{
        purpose: string; subscription_id: string;
        subscription_period_id: string | null; total_amount: number | string;
    }>(order.invoices);

    const { data: txn, error: txnError } = await supabaseAdmin
        .from("payment_transactions")
        .insert({
            payment_order_id: order.id,
            gateway_payment_id: input.gatewayPaymentId,
            gateway_signature: input.gatewaySignature,
            status: "succeeded",
            amount: input.amount,
            method: mapGatewayMethod(input.method),
            raw_payload: input.rawPayload as never,
        })
        .select("id")
        .maybeSingle();
    if (txnError) {
        if ((txnError as { code?: string }).code === "23505") return; // Already applied.
        throw txnError;
    }

    await supabaseAdmin
        .from("payment_orders")
        .update({ status: "paid" })
        .eq("id", order.id)
        .in("status", ["created", "attempted"]);

    // The allocation IS the record that this invoice was paid.
    //
    // Capped at what is still OWED, not at the invoice total. A payment can
    // legitimately exceed the invoice — `createOrderForInvoiceInternal` sizes
    // the order as `balance_amount + lateFee` — and
    // `assert_allocation_within_invoice` rejects allocations that would take
    // the invoice past its total.
    //
    // Total and balance are the same number only while nothing has been
    // allocated yet, which is why capping by total looked right. On a
    // part-paid invoice it was not: total 1000, already allocated 500, a
    // correctly-sized payment of 500 + 100 late fee allocated
    // min(600, 1000) = 600, taking allocations to 1100 and tripping the
    // constraint. The order was sized from the balance and the allocation
    // capped by the total; those disagree exactly when it matters.
    //
    // See docs/final-system-audit (finding H3).
    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("balance_amount")
        .eq("invoice_id", order.invoice_id)
        .maybeSingle();
    if (balanceError) throw balanceError;

    // No balance row means no invoice, which the FK makes impossible — fall
    // back to the total rather than allocating an unbounded amount.
    const owed = Number(balance?.balance_amount ?? invoice?.total_amount ?? input.amount);
    const allocated = round2(Math.min(input.amount, owed));

    // A fully-settled invoice paid again (a duplicate order, a manual retry
    // after the balance was cleared by another path) has nothing left to
    // allocate. Writing a zero row would fail `amount > 0`; skipping it
    // leaves the transaction recorded and the invoice correctly paid.
    if (allocated > 0) {
        const { error: allocationError } = await supabaseAdmin.from("payment_allocations").insert({
            payment_transaction_id: txn!.id,
            invoice_id: order.invoice_id,
            amount: allocated,
        });
        if (allocationError && (allocationError as { code?: string }).code !== "23505") {
            throw allocationError;
        }
    }

    if (invoice?.purpose === "initial") {
        await applyInitialSuccess(invoice.subscription_id, order.user_id);
    } else if (invoice?.purpose === "subscription_period") {
        await applyRenewalSuccess(invoice.subscription_id, invoice.subscription_period_id);
    }
    // 'settlement' and 'adhoc': the allocation above is the whole effect.

    await notifyUser(order.user_id, {
        template: "payment_success", title: "Payment Successful",
        body: "Payment successful. Your rental is active.", screen: "payments",
    });

    if (invoice?.purpose === "initial") {
        const { data: subscription } = await supabaseAdmin
            .from("subscriptions")
            .select("booking_id, bookings(held_vehicle_id)")
            .eq("id", invoice.subscription_id)
            .maybeSingle();
        const booking = unwrap<{ held_vehicle_id: string | null }>(subscription?.bookings);
        await notify({
            notificationType: "booking_created",
            referenceType: "booking",
            referenceId: subscription?.booking_id ?? invoice.subscription_id,
            title: "New Booking Confirmed",
            bodyFallback: "{rider} confirmed a booking for {vehicle}.",
            screen: "/bookings",
            riderId: order.user_id,
            vehicleId: booking?.held_vehicle_id ?? undefined,
            bookingId: subscription?.booking_id ?? undefined,
        });
    }
}

/** Confirms the booking and holds the deposit. */
async function applyInitialSuccess(subscriptionId: string, userId: string): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, booking_id")
        .eq("id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription) return;

    const { data: updated, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "confirmed" })
        .eq("id", subscription.booking_id)
        .eq("status", "pending_payment")
        .select("id")
        .maybeSingle();
    if (bookingError) throw bookingError;
    if (!updated) return; // Already confirmed by a prior delivery.

    const { error: depositError } = await supabaseAdmin
        .from("deposits")
        .update({ status: "held", held_at: new Date().toISOString() })
        .eq("subscription_id", subscriptionId)
        .eq("status", "pending");
    if (depositError) throw depositError;

    await writeAudit({
        actorId: null, targetUserId: userId, action: "booking.payment_completed",
        entityType: "booking", entityId: subscription.booking_id, after: { status: "confirmed" },
    });
    await writeAudit({
        actorId: null, targetUserId: userId, action: "deposit.held",
        entityType: "deposit", entityId: subscriptionId, after: { status: "held" },
    });
}

/**
 * A paid renewal.
 *
 * The two-phase "pay now, activate later" design survives, but it is now
 * expressed with rows rather than flags: paying schedules the NEXT period as
 * a real `subscription_periods` row with real dates, and the sweep promotes
 * it to `current` when its start arrives. `renewal_status`,
 * `scheduled_start_date` and `scheduled_duration_days` are all gone.
 *
 * A late payment still rolls forward immediately — there is no future period
 * to protect once the old one has lapsed.
 */
async function applyRenewalSuccess(
    subscriptionId: string,
    paidPeriodId: string | null,
): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status, duration_days_snapshot, plan_price_snapshot")
        .eq("id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription) return;

    const { data: current, error: currentError } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, sequence_number, ends_on, due_on")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return;

    // The invoice paid must be for the period actually running.
    if (paidPeriodId && paidPeriodId !== current.id) return;

    const nextStart = addDays(current.ends_on, 1);
    const nextEnd = addDays(nextStart, subscription.duration_days_snapshot - 1);
    const today = businessToday();
    const late = today > current.due_on;

    // Scheduled either way; what differs is whether it starts now. The
    // unique index on (subscription_id, sequence_number) makes a duplicate
    // delivery a no-op.
    const { error: insertError } = await supabaseAdmin.from("subscription_periods").insert({
        subscription_id: subscriptionId,
        sequence_number: current.sequence_number + 1,
        starts_on: late ? today : nextStart,
        ends_on: late ? addDays(today, subscription.duration_days_snapshot - 1) : nextEnd,
        due_on: late ? addDays(today, subscription.duration_days_snapshot - 1) : nextEnd,
        base_amount_snapshot: subscription.plan_price_snapshot,
        status: late ? "current" : "scheduled",
    });
    if (insertError) {
        if ((insertError as { code?: string }).code === "23505") return; // Already advanced.
        throw insertError;
    }

    if (late) {
        // Only one period may be `current`, so the lapsed one closes here.
        const { error: closeError } = await supabaseAdmin
            .from("subscription_periods")
            .update({ status: "closed" })
            .eq("id", current.id)
            .eq("status", "current");
        if (closeError) throw closeError;

        const { error: statusError } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active" })
            .eq("id", subscriptionId)
            .eq("status", "past_due");
        if (statusError) throw statusError;
    }

    await writeAudit({
        actorId: null, targetUserId: null, action: late ? "plan.renewed" : "plan.updated",
        entityType: "subscription", entityId: subscriptionId,
        after: {
            sequence_number: current.sequence_number + 1,
            starts_on: late ? today : nextStart,
            activated_immediately: late,
        },
    });
}

/**
 * Cancels the subscription behind an abandoned checkout.
 *
 * See the header: the FK chain forces the subscription to exist before a
 * payment can be taken, so a booking that expires unpaid leaves one behind.
 * The booking-expiry sweep must call this alongside releasing the hold.
 */
export async function cancelAbandonedSubscription(bookingId: string): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription || subscription.status !== "active") return;

    // Only if nothing was ever actually paid against it.
    const { data: paid, error: paidError } = await supabaseAdmin
        .from("payment_allocations")
        .select("id, invoices!inner(subscription_id)")
        .eq("invoices.subscription_id", subscription.id)
        .limit(1);
    if (paidError) throw paidError;
    if ((paid ?? []).length > 0) return;

    const { error: cancelError } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", subscription.id)
        .eq("status", "active");
    if (cancelError) throw cancelError;

    await writeAudit({
        actorId: null, targetUserId: null, action: "plan.updated",
        entityType: "subscription", entityId: subscription.id,
        after: { status: "cancelled", reason: "checkout abandoned" },
    });
}
