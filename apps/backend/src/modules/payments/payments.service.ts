import Razorpay from "razorpay";
import { supabaseAdmin } from "../../config/supabase";
import { createGatewayOrder, fetchGatewayPayment } from "../../config/razorpay";
import { env } from "../../config/env";
import { badRequest, businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { addDays, businessToday } from "../../common/dates";
import { computeInvoiceLateFee, lateFeeRuleFor } from "./renewalFee";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { applyRefundWebhookResult } from "../refunds/refunds.service";
import { tryAllocateVehicle } from "../bookings/bookings.service";
import { AuthContext } from "../../types";
import { Json } from "../../types/database.types";
import { CreateOrderResult, OrderLine, VerifyPaymentInput } from "./payments.types";

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
 * opening invoice are all created when CHECKOUT STARTS — but `pending_payment`
 * (added specifically for this), not `active`: nothing downstream should read
 * a checkout-in-progress as a live plan. Capture is what CONFIRMS them —
 * booking to `confirmed`, subscription to `active`, deposit to `held`, and
 * the allocation written (applyInitialSuccess).
 *
 * An abandoned checkout leaves a `pending_payment` subscription with an
 * unpaid invoice behind it. The booking-expiry sweep (re-implemented in Deno
 * at supabase/functions/booking-payment-expiry-sweep, which cannot import
 * this) cancels those alongside releasing the vehicle hold —
 * `cancelAbandonedSubscription` below is the Node equivalent of that logic.
 */

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Rupees to paise. Exported for tests: Razorpay is denominated in the
 * smallest currency unit, and every amount comparison in the verify path
 * depends on this rounding being exact.
 */
export const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Razorpay reports card/upi/wallet/netbanking/emi — `payment_method` has five. */
export function mapGatewayMethod(method: string | null): "card" | "wallet" | "upi" | "netbanking" | "cash" | null {
    if (method === "card" || method === "wallet" || method === "upi" || method === "netbanking") return method;
    return null;
}

/**
 * There is deliberately no `isGatewayConfigured()` short-circuit here any
 * more.
 *
 * The previous version settled the order immediately with a fabricated
 * `mock_payment_<uuid>` id whenever the keys were blank — booking confirmed,
 * deposit held, invoice fully allocated, no money taken. It existed so the
 * flow stayed clickable before real keys arrived, and the cost of that
 * convenience was that a production deploy with a dropped secret handed out
 * free rentals silently, writing fabricated rows into an append-only ledger
 * that cannot be deleted afterwards, only compensated.
 *
 * `getRazorpay()` now throws a clean 503 in dev, and env.ts refuses to boot
 * in production without the keys. A payment is recorded when, and only when,
 * Razorpay says it was captured.
 */

/** Whether every currency amount owed on this invoice has now been allocated. */
async function isInvoiceSettled(invoiceId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    return data?.is_paid === true;
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
            // Not 'active' yet — this exists only because the FK chain
            // (payment_orders.invoice_id -> invoices.subscription_id, both
            // NOT NULL) requires a subscription before an order can be
            // created. applyInitialSuccess flips this to 'active' once
            // payment actually captures; until then nothing should read
            // this row as a live plan.
            status: "pending_payment",
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
        .select("id, purpose, due_on, subscription_id, subscription_period_id")
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
    // so a toggled setting takes effect immediately. `invoice.due_on` is not
    // always the right reference date — computeInvoiceLateFee resolves that
    // through lateFeeReferenceDate, because a renewal invoice belongs to the
    // period being bought and its own due_on is a future date that would
    // score every late rider as early. It also nets off any part of the fee
    // already charged onto the bill (recordLateFeeCharge), so a part-paid
    // invoice cannot be asked for the same fee twice.
    const { lateFee } = await computeInvoiceLateFee(invoice);

    const amount = round2(Number(balance?.balance_amount ?? 0) + lateFee);
    if (amount <= 0) throw conflict("This invoice has already been paid.");

    // Reuse only an order for the SAME amount. Matching on invoice alone
    // returned a stale order after the price had moved: the late fee is
    // recomputed on every call and grows daily, so a rider who opened
    // checkout on Monday and paid on Friday was charged Monday's total and
    // left part-paid and apparently delinquent. See audit finding H3.
    const existing = await findReusableOrder(invoiceId, amount, lateFee);
    if (existing) return existing;

    // Anything still open at a DIFFERENT amount is now wrong, and
    // uq_payment_orders_open_per_invoice would reject the insert below while
    // it lives. Closing it is the correct resolution either way: one invoice
    // has one collectable price at a time.
    await supersedeOpenOrders(invoiceId, amount);

    // idempotency_key is `invoice:{id}:{amount}` — immutable and unique, so a
    // PRIOR order at this exact amount that has since gone dead (its TTL
    // passed with nobody paying, or it was superseded) still occupies that
    // key forever. That is fine for an amount that changes daily (a growing
    // late fee), but an invoice whose amount never moves (e.g. a flat return
    // settlement) hits the SAME key on every retry — findReusableOrder
    // correctly refuses to reuse a dead row, but a fresh INSERT then fails
    // with 23505 against that same dead row. Reopening it (new gateway
    // order, fresh TTL, same row) is the only way a rider can ever pay this
    // invoice again once that happens.
    const reopened = await reopenDeadOrder(invoiceId, amount, invoice.purpose, lateFee);
    if (reopened) return reopened;

    const expiresAt = new Date(Date.now() + env.paymentOrderTtlMinutes * 60_000);

    const gatewayOrder = await createGatewayOrder({
        amount: rupeesToPaise(amount),
        currency: "INR",
        receipt: `invoice_${invoiceId}`.slice(0, 40),
        notes: { invoice_id: invoiceId, purpose: invoice.purpose },
    });

    const { data: order, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .insert({
            gateway_order_id: gatewayOrder.id,
            invoice_id: invoiceId,
            user_id: actor.id,
            amount,
            currency: "INR",
            status: "created",
            // NOT NULL, and the point of it: a retried checkout for the same
            // invoice and amount must not create a second order. The amount
            // is IN the key, which is why superseding above is needed as well
            // — a changed price yields a different key and would otherwise
            // open a second live order.
            idempotency_key: `invoice:${invoiceId}:${amount}`,
            expires_at: expiresAt.toISOString(),
        })
        .select("id, gateway_order_id, amount, currency, expires_at")
        .single();
    if (orderError) {
        // Two concurrent taps on Pay. One insert wins; the loser re-reads
        // rather than erroring, so the rider sees one checkout sheet either
        // way. 23505 covers both the idempotency key and the partial unique
        // index on open orders.
        if ((orderError as { code?: string }).code === "23505") {
            const reused = await findReusableOrder(invoiceId, amount, lateFee);
            if (reused) return reused;
            const reopenedAfterRace = await reopenDeadOrder(invoiceId, amount, invoice.purpose, lateFee);
            if (reopenedAfterRace) return reopenedAfterRace;
        }
        throw orderError;
    }

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.order_created",
        entityType: "payment_order", entityId: order.id,
        after: { invoice_id: invoiceId, purpose: invoice.purpose, amount, late_fee: lateFee },
    });

    return toOrderResult(order, await orderLinesFor(invoiceId, lateFee));
}

async function findReusableOrder(
    invoiceId: string,
    amount: number,
    lateFee: number,
): Promise<CreateOrderResult | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, gateway_order_id, amount, currency, expires_at")
        .eq("invoice_id", invoiceId)
        .eq("amount", amount)
        .in("status", ["created", "attempted"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // An order past its TTL is not reusable even at the right price — its
    // vehicle hold may already have been released.
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;

    return toOrderResult(data, await orderLinesFor(invoiceId, lateFee));
}

/**
 * Reopens the one row `idempotency_key = invoice:{id}:{amount}` can ever
 * refer to, once it's gone dead (expired or failed) with nobody having paid
 * it — rather than trying (and failing on 23505) to insert a second row at
 * the same key. Only reachable once findReusableOrder has already said no,
 * so any row found here is by definition not `created`/`attempted` within
 * its TTL; still re-checked defensively before touching it.
 */
async function reopenDeadOrder(
    invoiceId: string,
    amount: number,
    purpose: string,
    lateFee: number,
): Promise<CreateOrderResult | null> {
    const { data: existing, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, status, expires_at")
        .eq("invoice_id", invoiceId)
        .eq("amount", amount)
        .maybeSingle();
    if (error) throw error;
    if (!existing) return null;

    const isLive = ["created", "attempted"].includes(existing.status)
        && (!existing.expires_at || new Date(existing.expires_at).getTime() >= Date.now());
    if (isLive) return null;

    const expiresAt = new Date(Date.now() + env.paymentOrderTtlMinutes * 60_000);
    const gatewayOrder = await createGatewayOrder({
        amount: rupeesToPaise(amount),
        currency: "INR",
        receipt: `invoice_${invoiceId}`.slice(0, 40),
        notes: { invoice_id: invoiceId, purpose },
    });

    const { data: reopened, error: updateError } = await supabaseAdmin
        .from("payment_orders")
        .update({
            gateway_order_id: gatewayOrder.id,
            status: "created",
            expires_at: expiresAt.toISOString(),
        })
        .eq("id", existing.id)
        .select("id, gateway_order_id, amount, currency, expires_at")
        .single();
    if (updateError) throw updateError;

    return toOrderResult(reopened, await orderLinesFor(invoiceId, lateFee));
}

/**
 * Closes any open order for this invoice whose amount no longer matches.
 *
 * The superseded Razorpay order is deliberately NOT cancelled at the gateway.
 * Razorpay has no order-cancellation API, and a rider holding the old
 * checkout sheet may still complete it — that money is real and must be
 * recordable. `applyPaymentSuccess` therefore accepts payments against
 * expired orders, and the allocation cap keeps the invoice from over-paying.
 */
async function supersedeOpenOrders(invoiceId: string, keepAmount: number): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .update({ status: "expired" })
        .eq("invoice_id", invoiceId)
        .neq("amount", keepAmount)
        .in("status", ["created", "attempted"])
        .select("id, amount");
    if (error) throw error;

    for (const superseded of data ?? []) {
        await writeAudit({
            actorId: null, targetUserId: null, action: "payment.order_superseded",
            entityType: "payment_order", entityId: superseded.id,
            after: { reason: "amount changed", old_amount: superseded.amount, new_amount: keepAmount },
        });
    }
}

function toOrderResult(
    order: {
        id: string; gateway_order_id: string | null; amount: number | string;
        currency: string; expires_at?: string | null;
    },
    lines: OrderLine[] = [],
): CreateOrderResult {
    return {
        orderId: order.id,
        gatewayOrderId: order.gateway_order_id!,
        amount: Number(order.amount),
        currency: order.currency,
        keyId: env.razorpayKeyId,
        expiresAt: order.expires_at ?? null,
        lines,
    };
}

/**
 * What the rider is paying for, itemised.
 *
 * Read from `invoice_items` — the same rows the invoice total is derived
 * from — so the breakdown and the charge cannot disagree. The late fee is
 * appended separately because it is computed fresh at checkout rather than
 * stored as a line: it grows daily until the invoice is paid.
 *
 * This exists because the CLIENT CANNOT COMPUTE THIS. Pricing rules are
 * resolved server-side by apply_period_adjustments, so a device adding
 * `plan.price + deposit` produces a different number — which is precisely the
 * mismatch a rider saw between the review screen and Checkout.
 */
async function orderLinesFor(invoiceId: string, lateFee: number): Promise<OrderLine[]> {
    const { data, error } = await supabaseAdmin
        .from("invoice_items")
        .select("description, amount, line_number")
        .eq("invoice_id", invoiceId)
        .order("line_number", { ascending: true });
    if (error) throw error;

    const lines: OrderLine[] = (data ?? []).map((item) => ({
        description: item.description,
        amount: Number(item.amount),
    }));

    if (lateFee > 0) lines.push({ description: "Late fee", amount: round2(lateFee) });
    return lines;
}

// ---------------------------------------------------------------------------
// Client-side verify callback — UI feedback only. NOT authoritative.
// ---------------------------------------------------------------------------

/**
 * The rider's app reporting what Checkout told it.
 *
 * Two independent things are established here, and the old version did only
 * the first:
 *
 *   1. AUTHENTICITY — the HMAC over `order_id|payment_id` proves the pair is
 *      genuine and belongs to this merchant. A forged or guessed payment id
 *      cannot produce a valid signature without KEY_SECRET.
 *
 *   2. SETTLEMENT — the signature says nothing about whether the money
 *      arrived. Razorpay computes it when the payment is CREATED, so it is
 *      equally valid for a payment that is merely `authorized`, one that is
 *      later voided, and one that failed. The amount is likewise not covered
 *      by it. So we ask the gateway directly, and every downstream effect
 *      uses the answer rather than what we hoped to collect.
 *
 * Even fully verified this path is a convenience: it lets the rider see
 * "confirmed" without waiting for the webhook. The webhook remains the
 * authority, and both funnel through the same idempotent core.
 */
export async function verifyPayment(input: VerifyPaymentInput, actor: AuthContext): Promise<void> {
    if (!env.razorpayKeySecret) throw businessRule("Payment gateway is not configured.");

    const valid = Razorpay.validateWebhookSignature(
        `${input.razorpay_order_id}|${input.razorpay_payment_id}`,
        input.razorpay_signature,
        env.razorpayKeySecret,
    );
    if (!valid) throw badRequest("Payment signature verification failed.");

    const order = await findOrderByGatewayOrderId(input.razorpay_order_id);
    // 404 rather than 403 on someone else's order — same convention as the
    // booking paths, so the endpoint is not an existence oracle.
    if (!order) throw notFound("Payment order not found.");
    if (order.user_id !== actor.id) throw notFound("Payment order not found.");

    const payment = await fetchGatewayPayment(input.razorpay_payment_id);

    // A genuine signature for a payment belonging to a DIFFERENT order. The
    // signature alone does not bind the pair to *our* order row, so this is
    // the check that stops one rider's captured payment being replayed
    // against another rider's order.
    if (payment.order_id !== input.razorpay_order_id) {
        throw badRequest("Payment does not belong to this order.");
    }

    if (payment.status === "failed") {
        await recordFailedAttempt(order.id, payment);
        throw businessRule(payment.error_description ?? "The payment did not go through.");
    }

    // `authorized` means the bank has reserved the funds and Razorpay has not
    // captured them. With auto-capture on this window is milliseconds, so the
    // honest answer to the rider is "we're confirming", not "you're booked".
    // The webhook completes it. Treating this as success is precisely how
    // goods get released against money that never settles.
    if (payment.status !== "captured" || !payment.captured) {
        await markOrderAttempted(order.id);
        throw conflict("Your payment is still being confirmed. This page will update shortly.");
    }

    if (payment.currency !== order.currency) {
        throw badRequest("Payment currency does not match the order.");
    }

    // Amount tampering, checked against the gateway's own figure rather than
    // anything the client sent. `partial_payment` is never enabled on our
    // orders, so a captured amount below the ask should be impossible —
    // which is exactly why it is worth failing loudly on.
    if (payment.amount !== rupeesToPaise(Number(order.amount))) {
        throw badRequest("Payment amount does not match the order.");
    }

    await applyPaymentSuccess({
        paymentOrderId: order.id,
        gatewayPaymentId: payment.id,
        gatewaySignature: input.razorpay_signature,
        amount: payment.amount / 100,
        method: payment.method,
        rawPayload: { source: "verify_callback", payment },
    });

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "payment.verified",
        entityType: "payment_order", entityId: order.id,
        after: { gateway_payment_id: payment.id, method: payment.method, amount: payment.amount / 100 },
    });
}

/** Moves a still-open order to `attempted` — the rider reached the gateway. */
async function markOrderAttempted(orderId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("payment_orders")
        .update({ status: "attempted" })
        .eq("id", orderId)
        .eq("status", "created");
    if (error) throw error;
}

/**
 * Records a declined attempt against the order.
 *
 * `payment_transactions` gained nullable `captured_at` plus `failure_code` /
 * `failure_reason` in migration 47 for exactly this. The row is worth having:
 * a rider who fails three times and succeeds on the fourth previously left no
 * trace of the three, which is the history support is asked about.
 *
 * Idempotent on `gateway_payment_id`, like every other write here.
 */
async function recordFailedAttempt(
    orderId: string,
    payment: { id: string; amount: number; method: string | null; error_code: string | null; error_description: string | null },
): Promise<void> {
    const { error } = await supabaseAdmin.from("payment_transactions").insert({
        payment_order_id: orderId,
        gateway_payment_id: payment.id,
        status: "failed",
        amount: payment.amount / 100,
        method: mapGatewayMethod(payment.method),
        captured_at: null,
        failure_code: payment.error_code,
        failure_reason: payment.error_description ?? "Payment failed.",
        raw_payload: payment as never,
    });
    if (error && (error as { code?: string }).code !== "23505") throw error;
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
    eventIdHeader: string | undefined,
): Promise<void> {
    if (!env.razorpayWebhookSecret) throw businessRule("Webhook secret is not configured.");
    if (!signatureHeader) throw badRequest("Missing webhook signature.");

    const valid = Razorpay.validateWebhookSignature(
        rawBody.toString("utf8"),
        signatureHeader,
        env.razorpayWebhookSecret,
    );

    const body = JSON.parse(rawBody.toString("utf8")) as WebhookPayload & {
        event?: string; id?: string;
    };
    const eventType = body.event ?? "unknown";

    // Razorpay sends `x-razorpay-event-id` for precisely this purpose and it
    // is stable across redeliveries; the body's `id` is the fallback.
    //
    // The previous fallback was `randomUUID()`, which is unique per call and
    // therefore the opposite of an idempotency key — a redelivery would have
    // inserted a second event row and re-dispatched. The money stayed correct
    // because applyPaymentSuccess is anchored on gateway_payment_id, but
    // failure and refund handling are not equally protected. An event we
    // cannot identify is now rejected rather than invented.
    const eventId = eventIdHeader ?? body.id;
    if (!eventId) throw badRequest("Missing webhook event id.");

    // A forged or replayed delivery is RECORDED, not silently dropped.
    // Throwing before any write left the Reconciliation console's
    // `is_signature_valid = false` query permanently empty, so an attacker
    // probing the endpoint was invisible. The row is the evidence.
    if (!valid) {
        await supabaseAdmin
            .from("payment_webhook_events")
            .insert({
                gateway: "razorpay",
                gateway_event_id: `invalid:${eventId}`,
                event_type: eventType,
                is_signature_valid: false,
                payload: body as unknown as Json,
                processing_error: "Signature verification failed.",
            })
            // A repeat forgery with the same id is not worth a 500.
            .then(({ error: e }) => {
                if (e && (e as { code?: string }).code !== "23505") throw e;
            });

        await writeAudit({
            actorId: null, targetUserId: null, action: "payment.webhook_signature_invalid",
            entityType: "payment_webhook_event", entityId: eventId,
            after: { event: eventType },
        });

        throw badRequest("Webhook signature verification failed.");
    }

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
            // NOT NULL with no default, and it was omitted under an `as never`
            // cast that suppressed the compile error. Every delivery therefore
            // raised 23502 and the webhook — the authoritative confirmation
            // path — had never once run. See audit finding C1. The cast is
            // gone so the type checker guards this column from now on.
            is_signature_valid: true,
            payload: body as unknown as Json,
        })
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

    // Counted before dispatch, so a payload that throws every time is
    // distinguishable from a first delivery still in flight. `processed_at is
    // null AND processing_attempts > 3` is a poison event worth paging on.
    await bumpWebhookAttempt(eventRowId);

    try {
        await dispatchWebhookEvent(eventType, body);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await supabaseAdmin
            .from("payment_webhook_events")
            .update({ processing_error: message })
            .eq("id", eventRowId);
        // Rethrown so Razorpay sees a non-2xx and redelivers. processed_at
        // stays null, which is both the retry signal and the reconciliation
        // query: payments that were taken and never applied.
        throw err;
    }

    // Only now is the event finished.
    await supabaseAdmin
        .from("payment_webhook_events")
        .update({ processed_at: new Date().toISOString(), processing_error: null })
        .eq("id", eventRowId);
}

async function bumpWebhookAttempt(eventRowId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("payment_webhook_events")
        .select("processing_attempts")
        .eq("id", eventRowId)
        .maybeSingle();
    if (error) throw error;

    await supabaseAdmin
        .from("payment_webhook_events")
        .update({ processing_attempts: (data?.processing_attempts ?? 0) + 1 })
        .eq("id", eventRowId);
}

async function dispatchWebhookEvent(eventType: string, payload: WebhookPayload): Promise<void> {
    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;

    // `order.paid` fires once the order is fully collected and carries the
    // payment entity alongside; treated as a capture so a missed
    // payment.captured still lands. Both funnel into the same idempotent
    // core, so receiving both is a no-op on the second.
    if ((eventType === "payment.captured" || eventType === "order.paid") && payment) {
        const order = await findOrderByGatewayOrderId(String(payment.order_id));
        if (!order) return;

        // Currency is checked here as well as in verifyPayment because the
        // webhook is the path that runs when the client never comes back.
        if (String(payment.currency ?? order.currency) !== order.currency) {
            throw new Error(
                `Webhook currency ${String(payment.currency)} does not match order ${order.id}.`,
            );
        }

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

    // The bank has reserved the funds; Razorpay has not captured them. Not
    // success — but it does mean the rider is mid-payment, so the order moves
    // to `attempted` and the expiry sweep leaves it alone rather than
    // releasing the scooter hold out from under an in-flight payment.
    if (eventType === "payment.authorized" && payment) {
        const order = await findOrderByGatewayOrderId(String(payment.order_id));
        if (!order) return;
        await markOrderAttempted(order.id);
        await extendOrderExpiry(order.id);
        return;
    }

    if (eventType === "payment.failed" && payment) {
        const order = await findOrderByGatewayOrderId(String(payment.order_id));
        if (order && payment.id) {
            await recordFailedAttempt(order.id, {
                id: String(payment.id),
                amount: Number(payment.amount),
                method: (payment.method as string) ?? null,
                error_code: payment.error_code ? String(payment.error_code) : null,
                error_description: payment.error_description ? String(payment.error_description) : null,
            });
        }
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
): Promise<{ id: string; user_id: string; amount: number | string; currency: string } | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_orders")
        .select("id, user_id, amount, currency")
        .eq("gateway_order_id", gatewayOrderId)
        .maybeSingle();
    if (error) throw error;
    return data ?? null;
}

/**
 * Pushes an in-flight order's expiry out, so the sweep does not close a
 * checkout the rider is actively completing. Only ever extends.
 */
async function extendOrderExpiry(orderId: string): Promise<void> {
    const extendedTo = new Date(Date.now() + env.paymentOrderTtlMinutes * 60_000).toISOString();
    const { error } = await supabaseAdmin
        .from("payment_orders")
        .update({ expires_at: extendedTo })
        .eq("id", orderId)
        .in("status", ["created", "attempted"])
        .lt("expires_at", extendedTo);
    if (error) throw error;
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

    await notify({
        notificationType: "payment_failed",
        referenceType: "payment_order",
        referenceId: order.id,
        title: "Payment Failed",
        bodyFallback: `{rider}'s payment could not be completed: ${reason}`,
        screen: "/payments",
        riderId: order.user_id,
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

    // `neq("status", "paid")` rather than a whitelist of open statuses.
    //
    // A rider whose first attempt declines may retry the SAME Razorpay order
    // and succeed, and a rider holding a superseded checkout sheet may pay an
    // order we already expired. Both arrive here against an order that is
    // `failed` or `expired`, and both are real money. Restricting the update
    // to created/attempted left those orders permanently mislabelled while
    // the transaction and allocation were written — the ledger and the order
    // disagreeing about the same payment. `paid` is terminal and the database
    // trigger enforces that; getting INTO it is what must stay permissive.
    await supabaseAdmin
        .from("payment_orders")
        .update({ status: "paid" })
        .eq("id", order.id)
        .neq("status", "paid");

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
    const balanceDue = Number(balance?.balance_amount ?? invoice?.total_amount ?? input.amount);

    // The late fee is money the invoice does not know about.
    //
    // createOrderForInvoiceInternal sizes the order as `balance + lateFee`,
    // but the fee was never written anywhere on the bill — so the allocation,
    // capped at the balance, left the fee stranded as an "unallocated
    // surplus" audit row. Every late renewal produced one: real money
    // captured, no invoice line behind it, reconciliation by hand.
    //
    // It is recorded here, at capture, rather than at order time: the amount
    // that actually arrived is what decides it, so a superseded checkout
    // sheet paid at yesterday's (larger) price cannot inflate the fee, and an
    // abandoned checkout never puts a charge on a bill nobody paid.
    const owed = round2(
        balanceDue + await recordLateFeeCharge(order.invoice_id, input.amount - balanceDue),
    );
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

    // Money that arrived but had nowhere to go. Either the invoice was
    // already settled by another path, or a superseded checkout sheet was
    // completed after the price moved. It is an overpayment and needs a
    // human decision — auto-refunding it here would be a money movement
    // nobody asked for — so it is flagged where Reconciliation will find it.
    if (allocated < round2(input.amount)) {
        await writeAudit({
            actorId: null, targetUserId: order.user_id, action: "payment.unallocated_surplus",
            entityType: "payment_transaction", entityId: txn!.id,
            after: {
                invoice_id: order.invoice_id,
                captured: round2(input.amount),
                allocated,
                surplus: round2(input.amount - allocated),
            },
        });
    }

    // Goods are released on SETTLEMENT, not on the arrival of some money.
    //
    // These used to be called on `purpose` alone, so a capture smaller than
    // the invoice total confirmed the booking and held the deposit against a
    // part-paid bill. Razorpay rejects a mismatched amount while
    // `partial_payment` is false — which it is, and which we never set — so
    // that was defence in depth rather than a live hole. It is still the
    // wrong dependency: the state machine must not be correct only because
    // of a gateway setting made in a dashboard we do not control.
    const settled = await isInvoiceSettled(order.invoice_id);

    // WHICH PERIOD is being paid, not what the invoice is labelled.
    //
    // `purpose` cannot answer this. generate_period_invoice() writes
    // 'subscription_period' for every invoice it creates — the opening one
    // included — and the schema forbids relabelling it: chk_invoices_purpose_period
    // requires (purpose = 'subscription_period') = (subscription_period_id is not null),
    // so an invoice tied to period 1 can never be 'initial'.
    //
    // Branching on purpose therefore meant applyInitialSuccess NEVER RAN, for
    // any booking, ever. Riders paid in full, the money was captured and
    // allocated, `is_paid` went true — and the booking sat at
    // `pending_payment` with its deposit unheld, because the one branch that
    // confirms it was gated on a label nothing produces.
    //
    // The period's sequence_number is the real question: #1 activates the
    // agreement, anything later renews it.
    const periodSequence = invoice?.subscription_period_id
        ? await getPeriodSequenceNumber(invoice.subscription_period_id)
        : null;

    if (settled && invoice && (invoice.purpose === "initial" || periodSequence === 1)) {
        await applyInitialSuccess(invoice.subscription_id, order.user_id);
    } else if (settled && invoice && periodSequence !== null && periodSequence > 1) {
        await applyRenewalSuccess(invoice.subscription_id, invoice.subscription_period_id);
    }
    // 'settlement' and 'adhoc': the allocation above is the whole effect.

    if (!settled) {
        await writeAudit({
            actorId: null, targetUserId: order.user_id, action: "payment.partial",
            entityType: "invoice", entityId: order.invoice_id,
            after: { allocated, note: "invoice still has a balance; no state advanced" },
        });
        // Deliberately no success notification — telling a rider their rental
        // is active when the bill is not settled is the worst of both.
        return;
    }

    // The rider must be told what the payment was actually FOR — "your
    // rental is active" is only true for a rental/renewal payment. An
    // overdue-late-fee payment ('adhoc' — see overdueLateFee.ts) and a
    // return-settlement payment ('settlement' — the additional amount due
    // from damage/other charges, see returns.service.ts) are both still
    // mid-return: the rider is waiting on something else to happen next,
    // not riding. Reusing the generic copy for those told a rider mid-return
    // that their rental was "active" while they were actually waiting on
    // admin to verify a payment and complete the return.
    const paymentSuccessCopy = invoice?.purpose === "adhoc"
        ? {
            title: "Late Fee Payment Successful",
            body: "Your late fee has been paid successfully. Your return is being processed.",
        }
        : invoice?.purpose === "settlement"
            ? {
                title: "Payment Successful",
                body: "Your additional return amount has been paid successfully. Your vehicle return is awaiting admin verification.",
            }
            : {
                title: "Payment Successful",
                body: "Payment successful. Your rental is active.",
            };

    await notifyUser(order.user_id, {
        template: "payment_success", title: paymentSuccessCopy.title,
        body: paymentSuccessCopy.body, screen: "payments",
    });

    await notify({
        notificationType: "payment_success",
        referenceType: "payment_order",
        referenceId: order.id,
        title: "Payment Received",
        bodyFallback: "{rider} completed a payment.",
        screen: "/payments",
        riderId: order.user_id,
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

/**
 * Which billing period this invoice covers. 1 is the opening period.
 *
 * Null when the period has since been deleted, which is treated as "neither
 * activation nor renewal" — the allocation still stands, nothing advances.
 */
async function getPeriodSequenceNumber(periodId: string): Promise<number | null> {
    const { data, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("sequence_number")
        .eq("id", periodId)
        .maybeSingle();
    if (error) throw error;
    return data?.sequence_number ?? null;
}

/**
 * Put the late fee on the bill it was charged against.
 *
 * Returns how much was added to the invoice total, so the caller can allocate
 * the captured money against it. 0 whenever there is nothing to record — not
 * a renewal, not late, the fee already recorded, or no surplus over the
 * balance (an on-time payment).
 *
 * The fee becomes a `subscription_adjustments` row as well as an invoice
 * line, which is the point: it is a charge like any other, and this is what
 * makes an overdue rider's late fee visible to the same reporting that
 * already shows their transaction fee. The partial unique index
 * `uq_subscription_adjustments_rule_period` is what makes a second call — a
 * redelivered webhook, a retry after a part-payment — a no-op instead of a
 * second fee.
 *
 * `surplus` caps it deliberately. A rider holding a superseded checkout sheet
 * may pay MORE than the current price for reasons that have nothing to do
 * with lateness; only money that actually arrived above the balance can be
 * attributed to the fee, and anything left over still lands in the
 * unallocated-surplus audit trail for a human.
 */
async function recordLateFeeCharge(invoiceId: string, surplus: number): Promise<number> {
    if (surplus <= 0) return 0;

    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, purpose, status, due_on, subscription_id, subscription_period_id, subtotal_amount, total_amount")
        .eq("id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    if (!invoice?.subscription_period_id) return 0;
    // A voided bill is not a bill. Money against one is a surplus for a human
    // to decide about, which is where it already ends up.
    if (invoice.status === "void") return 0;

    const { isLate, lateFee, daysLate, feePerDay } = await computeInvoiceLateFee(invoice);
    if (!isLate || lateFee <= 0) return 0;

    const rule = await lateFeeRuleFor(invoice.subscription_id);
    if (!rule) return 0;

    const amount = round2(Math.min(lateFee, surplus));
    if (amount <= 0) return 0;

    const { data: adjustment, error: adjustmentError } = await supabaseAdmin
        .from("subscription_adjustments")
        .insert({
            subscription_id: invoice.subscription_id,
            subscription_period_id: invoice.subscription_period_id,
            pricing_rule_id: rule.id,
            kind: "charge",
            code_snapshot: rule.code,
            name_snapshot: rule.name,
            amount,
            status: "invoiced",
        })
        .select("id")
        .maybeSingle();
    if (adjustmentError) {
        // Already recorded for this period — the invoice total already
        // includes it, so there is nothing to add.
        if ((adjustmentError as { code?: string }).code === "23505") return 0;
        throw adjustmentError;
    }

    const { data: lastItem } = await supabaseAdmin
        .from("invoice_items")
        .select("line_number")
        .eq("invoice_id", invoiceId)
        .order("line_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    const description = `${rule.name} — ${daysLate} day${daysLate === 1 ? "" : "s"} × ₹${feePerDay}`;

    const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
        invoice_id: invoiceId,
        line_number: (lastItem?.line_number ?? 0) + 1,
        item_type: "adjustment",
        subscription_adjustment_id: adjustment!.id,
        description,
        quantity: 1,
        unit_amount: amount,
        amount,
    });
    if (itemError) {
        // Undo the adjustment rather than leaving one with no line behind it:
        // the unique index would otherwise make every retry a no-op and the
        // fee could never be recorded at all.
        await supabaseAdmin.from("subscription_adjustments").delete().eq("id", adjustment!.id);
        throw itemError;
    }

    const { error: totalError } = await supabaseAdmin
        .from("invoices")
        .update({
            subtotal_amount: round2(Number(invoice.subtotal_amount) + amount),
            total_amount: round2(Number(invoice.total_amount) + amount),
        })
        .eq("id", invoiceId);
    if (totalError) throw totalError;

    await writeAudit({
        actorId: null, targetUserId: null, action: "invoice.late_fee_charged",
        entityType: "invoice", entityId: invoiceId,
        after: {
            amount, days_late: daysLate, fee_per_day: feePerDay,
            pricing_rule_code: rule.code, subscription_adjustment_id: adjustment!.id,
        },
    });

    return amount;
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

    // The subscription existed only to satisfy the FK chain that let this
    // payment happen at all (see ensureSubscription) — this is the moment it
    // becomes a real, live plan.
    const { error: subscriptionError } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: "active" })
        .eq("id", subscriptionId)
        .eq("status", "pending_payment");
    if (subscriptionError) throw subscriptionError;

    // Only now — payment settled and the booking is genuinely 'confirmed' —
    // does a specific vehicle get held against it. Best-effort: a booking
    // with nothing free yet still confirms, and staff allocate one manually
    // at pickup (confirmPickup accepts an explicit vehicle_id for that).
    await tryAllocateVehicle(subscription.booking_id);

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
 * The two-phase "pay now, activate later" design survives, but billing
 * .service.ts's advanceToNextPeriod now creates the next `subscription
 * _periods` row EAGERLY, the moment a rider previews a renewal — before any
 * payment — always as 'scheduled', because the invoice it is generating
 * needs a real period to attach to. A preview a rider cancels or never pays
 * leaves that row behind, scheduled and unpaid; a captured payment is the
 * only thing allowed to promote it. So this is where activation now
 * actually happens, decided fresh at payment time rather than trusting
 * whatever status the row was left in at preview time:
 *
 *   - if the subscription's currently-running period is already past its
 *     own due date (this was a late renewal), close it and promote the paid
 *     period to 'current' immediately, and clear `past_due` if it was set.
 *   - otherwise the rider paid ahead of the period still running — leave
 *     the paid period 'scheduled'; the payment-overdue sweep's
 *     promotePeriod activates it once the running period actually ends.
 *
 * Guarded to be a no-op if the period isn't 'scheduled' any more (a second
 * webhook delivery for the same payment, or a race with the sweep already
 * having promoted it).
 *
 * Everything that READS a scheduled period — the sweep, the rider's own
 * screens, the admin filter — checks its invoice is paid before calling it a
 * renewal, for the same reason: see paidPeriodIds in renewalPeriod.ts.
 */
async function applyRenewalSuccess(
    subscriptionId: string,
    paidPeriodId: string | null,
): Promise<void> {
    if (!paidPeriodId) return;

    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, status, duration_days_snapshot")
        .eq("id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription) return;

    const { data: paidPeriod, error: periodError } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, sequence_number, status")
        .eq("id", paidPeriodId)
        .maybeSingle();
    if (periodError) throw periodError;
    if (!paidPeriod) return;
    if (paidPeriod.status !== "scheduled") return;

    const { data: current, error: currentError } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, due_on")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (currentError) throw currentError;

    const activateNow = !current || businessToday() > current.due_on;

    if (!activateNow) {
        await writeAudit({
            actorId: null, targetUserId: subscription.user_id, action: "plan.renewed",
            entityType: "subscription", entityId: subscriptionId,
            after: {
                sequence_number: paidPeriod.sequence_number,
                period_status: "scheduled",
                activated_immediately: false,
            },
        });
        return;
    }

    // Re-anchored at PAYMENT time, not trusted from preview time.
    // advanceToNextPeriod stamped these dates when the rider opened Review &
    // Renew — a rider who previews on Monday and pays on Thursday would
    // otherwise be sold a week that started three days ago. Only the
    // activate-now path needs it: a period paid ahead of schedule is anchored
    // to the end of the period still running, which has not moved.
    const startsOn = businessToday();
    const endsOn = addDays(startsOn, subscription.duration_days_snapshot - 1);
    const { error: reanchorError } = await supabaseAdmin
        .from("subscription_periods")
        .update({ starts_on: startsOn, ends_on: endsOn, due_on: endsOn })
        .eq("id", paidPeriod.id)
        .eq("status", "scheduled");
    if (reanchorError) throw reanchorError;

    if (current) {
        const { error: closeError } = await supabaseAdmin
            .from("subscription_periods")
            .update({ status: "closed" })
            .eq("id", current.id)
            .eq("status", "current");
        if (closeError) throw closeError;
    }

    const { error: promoteError } = await supabaseAdmin
        .from("subscription_periods")
        .update({ status: "current" })
        .eq("id", paidPeriod.id)
        .eq("status", "scheduled");
    if (promoteError) throw promoteError;

    if (subscription.status === "past_due") {
        const { error: statusError } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "active" })
            .eq("id", subscriptionId)
            .eq("status", "past_due");
        if (statusError) throw statusError;
    }

    await writeAudit({
        actorId: null, targetUserId: subscription.user_id, action: "plan.renewed",
        entityType: "subscription", entityId: subscriptionId,
        after: {
            sequence_number: paidPeriod.sequence_number,
            period_status: "current",
            activated_immediately: true,
        },
    });
}

/**
 * Cancels the subscription behind an abandoned checkout.
 *
 * See the header: the FK chain forces the subscription to exist before a
 * payment can be taken, so a booking that expires unpaid leaves one behind
 * — still `pending_payment`, since applyInitialSuccess is the only thing
 * that ever advances it to `active`. The booking-expiry sweep must call this
 * alongside releasing the hold (re-implemented in Deno at
 * supabase/functions/booking-payment-expiry-sweep, which cannot import this).
 */
export async function cancelAbandonedSubscription(bookingId: string): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription || subscription.status !== "pending_payment") return;

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
        .eq("status", "pending_payment");
    if (cancelError) throw cancelError;

    await writeAudit({
        actorId: null, targetUserId: null, action: "plan.updated",
        entityType: "subscription", entityId: subscription.id,
        after: { status: "cancelled", reason: "checkout abandoned" },
    });
}

/**
 * What a plan will cost, itemised, BEFORE anything is created.
 *
 * Exists so the review screen can show the real bill — including the
 * welcome discount and any fee — rather than `plan price + deposit`, which
 * is all the client can work out on its own. Getting that wrong is not a
 * cosmetic problem: the rider agreed to one number and Razorpay then asked
 * for a different one.
 *
 * Reads through quote_plan_first_period(), which resolves pricing rules via
 * the SAME function apply_period_adjustments() uses, so the quote and the
 * invoice it becomes cannot drift apart. Writes nothing — safe to call from
 * a screen the rider may well abandon.
 */
export async function quotePlan(planId: string, startDay?: string): Promise<{
    lines: OrderLine[];
    amount: number;
    currency: string;
}> {
    const { data, error } = await supabaseAdmin.rpc("quote_plan_first_period", {
        p_plan_id: planId,
        ...(startDay ? { p_starts_on: startDay } : {}),
    });
    if (error) {
        // The function raises no_data_found for an unknown or deleted plan.
        if ((error as { code?: string }).code === "P0002") throw notFound("Plan not found.");
        throw error;
    }

    const lines: OrderLine[] = (data ?? []).map((row) => ({
        description: row.description,
        amount: Number(row.amount),
    }));

    return {
        lines,
        amount: round2(lines.reduce((total, line) => total + line.amount, 0)),
        currency: "INR",
    };
}
