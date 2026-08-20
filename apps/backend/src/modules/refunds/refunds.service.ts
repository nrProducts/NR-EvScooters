import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { env } from "../../config/env";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import {
    getDepositForSubscription, getDepositForSubscriptionOrNull, refundableAmountForSubscription,
} from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import { ListRefundsFilters, RefundBookingSummary, RefundRow, RefundType } from "./refunds.types";
import { businessToday } from "../../common/dates";

/**
 * Refunds.
 *
 * One change drives everything here: **a refund names the payment it
 * reverses.** `payment_transaction_id` is NOT NULL, replacing `deposit_id` +
 * `booking_id` + a denormalised `source_gateway_payment_id`.
 *
 * That removes a class of bug rather than moving one. The old
 * `processRefund` had to go looking for something to refund against —
 * `invoices.gateway_ref` filtered by `payment_type` — and failed at gateway
 * time if it guessed wrong. The payment is now chosen when the refund is
 * created, which is when someone actually knows which money is coming back.
 *
 * The old mirrors are gone too: `bookings.refund_status`, `deposits.refund_id`
 * and `invoices.payment_status = 'refunded'` were three copies of a fact the
 * refund row already held. Nothing writes them, so nothing can disagree.
 */

const REFUND_COLUMNS = `
    id, user_id, payment_transaction_id, amount, status, reason,
    gateway_refund_id, attempt_count, last_attempted_at, failure_reason,
    initiated_at, completed_at, created_at,
    payment_transactions(
        gateway_payment_id,
        payment_orders(
            invoice_id,
            invoices(
                subscription_id,
                subscriptions(
                    id,
                    bookings(
                        id, requested_start_on,
                        booking_cancellations(cancelled_at, reason, penalty_amount),
                        plans(vehicle_models(name)),
                        hubs(name)
                    ),
                    users(full_name, phone)
                )
            )
        )
    )
`;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Same "no keys configured in dev" fallback payments.service.ts uses. */
function isGatewayConfigured(): boolean {
    return !!env.razorpayKeyId && !!env.razorpayKeySecret;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawRefundRow {
    id: string;
    user_id: string;
    payment_transaction_id: string;
    amount: number | string;
    status: RefundRow["status"];
    reason: RefundType;
    gateway_refund_id: string | null;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    completed_at: string | null;
    created_at: string;
    payment_transactions: unknown;
}

/**
 * Walks refund → payment → order → invoice → subscription → booking once.
 *
 * The invoice is in the middle because a `payment_orders` row pays exactly
 * ONE invoice (`invoice_id` NOT NULL). That is a real tightening: the old
 * order carried a `booking_id` and a free-text `purpose`, and one order could
 * be claimed to have settled any number of invoices.
 */
function chainOf(row: RawRefundRow) {
    const txn = unwrap<{ gateway_payment_id: string | null; payment_orders: unknown }>(row.payment_transactions);
    const order = unwrap<{ invoice_id: string; invoices: unknown }>(txn?.payment_orders);
    const invoice = unwrap<{ subscription_id: string; subscriptions: unknown }>(order?.invoices);
    const subscription = unwrap<{ id: string; bookings: unknown; users: unknown }>(invoice?.subscriptions);
    const booking = unwrap<{
        id: string; requested_start_on: string; booking_cancellations: unknown;
        plans: unknown; hubs: unknown;
    }>(subscription?.bookings);
    return { txn, subscription, booking };
}

function toRefundBookingSummary(row: RawRefundRow): RefundBookingSummary | null {
    const { subscription, booking } = chainOf(row);
    if (!booking) return null;

    const cancellation = unwrap<{
        cancelled_at: string; reason: string | null; penalty_amount: number | string;
    }>(booking.booking_cancellations);
    const rider = unwrap<{ full_name: string; phone: string | null }>(subscription?.users);
    const plan = unwrap<{ vehicle_models: unknown }>(booking.plans);

    return {
        id: booking.id,
        cancelled_at: cancellation?.cancelled_at ?? null,
        cancellation_reason: cancellation?.reason ?? null,
        cancellation_penalty_amount: cancellation ? Number(cancellation.penalty_amount) : null,
        // Reconstructed from the payment rather than a frozen booking column:
        // what the rider was owed back IS the refund amount.
        plan_price_at_cancellation: null,
        vehicle_model_name: unwrap<{ name: string }>(plan?.vehicle_models)?.name ?? null,
        station_name: unwrap<{ name: string }>(booking.hubs)?.name ?? null,
        rider_name: rider?.full_name ?? null,
        rider_phone: rider?.phone ?? null,
    };
}

function toRefundRow(row: RawRefundRow, depositId: string | null = null): RefundRow {
    const { txn, booking } = chainOf(row);
    return {
        id: row.id,
        deposit_id: depositId,
        booking_id: booking?.id ?? null,
        user_id: row.user_id,
        amount: Number(row.amount),
        status: row.status,
        refund_type: row.reason,
        gateway_refund_id: row.gateway_refund_id,
        source_gateway_payment_id: txn?.gateway_payment_id ?? null,
        payment_transaction_id: row.payment_transaction_id,
        attempt_count: row.attempt_count,
        last_attempted_at: row.last_attempted_at,
        failure_reason: row.failure_reason,
        initiated_at: row.initiated_at,
        processed_at: row.completed_at,
        created_at: row.created_at,
        booking: toRefundBookingSummary(row),
    };
}

/**
 * The captured payment to refund against.
 *
 * Chosen at CREATION time now, not at gateway time. The most recent succeeded
 * payment on the subscription is the right answer for every case this system
 * has: the initial capture pays both the plan fee and the deposit in one
 * Razorpay payment, and a renewal is its own payment.
 */
async function latestCapturedPayment(subscriptionId: string): Promise<{ id: string; userId: string } | null> {
    const { data, error } = await supabaseAdmin
        .from("payment_transactions")
        .select("id, payment_orders!inner(user_id, invoices!inner(subscription_id))")
        .eq("payment_orders.invoices.subscription_id", subscriptionId)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    // The payer is on the ORDER, not the transaction — a transaction records
    // what the gateway did, and only the order knows whose checkout it was.
    const order = unwrap<{ user_id: string }>(data.payment_orders);
    return order ? { id: data.id, userId: order.user_id } : null;
}

async function readRefund(id: string): Promise<RawRefundRow | null> {
    const { data, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    return (data as unknown as RawRefundRow) ?? null;
}

/** An existing live refund of this reason against this subscription, if any. */
async function existingRefund(subscriptionId: string, reason: RefundType): Promise<RawRefundRow | null> {
    const { data, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("reason", reason as NonNullable<RefundType>)
        .eq("payment_transactions.payment_orders.invoices.subscription_id", subscriptionId)
        .in("status", ["pending", "processing", "succeeded"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return (data as unknown as RawRefundRow) ?? null;
}

/**
 * Creates (or reuses) a pending refund for a held deposit. Does NOT call the
 * gateway — see processRefund. Enforces the post-return holding period; not
 * admin-overridable, per spec.
 */
export async function initiateRefund(depositId: string, actor: AuthContext | null): Promise<RefundRow> {
    const { data: deposit, error } = await supabaseAdmin
        .from("deposits")
        .select("id, subscription_id, amount, status, refund_eligible_on")
        .eq("id", depositId)
        .maybeSingle();
    if (error) throw error;
    if (!deposit) throw notFound("Deposit not found.");
    if (deposit.status !== "held") throw businessRule("Only a held deposit can be refunded.");

    // A DATE comparison now: eligibility begins at the start of the day.
    const today = businessToday();
    if (!deposit.refund_eligible_on || deposit.refund_eligible_on > today) {
        throw businessRule("This deposit is not yet eligible for refund — it must wait out the post-return holding period.");
    }

    const existing = await existingRefund(deposit.subscription_id, "deposit_release");
    if (existing) return toRefundRow(existing, depositId);

    const amount = await refundableAmountForSubscription(deposit.subscription_id, Number(deposit.amount));
    if (amount <= 0) throw businessRule("Nothing is left to refund on this deposit.");

    const payment = await latestCapturedPayment(deposit.subscription_id);
    if (!payment) throw businessRule("No captured payment found to refund against.");

    const { data, error: insertError } = await supabaseAdmin
        .from("refunds")
        .insert({
            user_id: payment.userId,
            payment_transaction_id: payment.id,
            amount,
            reason: "deposit_release",
            status: "pending",
        })
        .select(REFUND_COLUMNS)
        .single();
    if (insertError) throw insertError;
    const refund = toRefundRow(data as unknown as RawRefundRow, depositId);

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: refund.user_id, action: "refund.initiated",
        entityType: "refund", entityId: refund.id, after: { deposit_id: depositId, amount },
    });

    await notifyUser(refund.user_id, {
        template: "refund_initiated",
        title: "Refund Initiated",
        body: `Your security deposit refund of ₹${amount} has been initiated.`,
        screen: "my-plan",
    });

    await notify({
        notificationType: "refund_needs_approval",
        referenceType: "refund",
        referenceId: refund.id,
        title: "Refund Needs Approval",
        bodyFallback: `A ₹${amount} deposit refund for {rider} ({vehicle}) is awaiting approval.`,
        screen: "/refunds",
        bookingId: refund.booking_id ?? undefined,
        riderId: refund.user_id,
        riderNameOverride: refund.booking?.rider_name ?? undefined,
        vehicleNameOverride: refund.booking?.vehicle_model_name ?? undefined,
    });

    return refund;
}

/**
 * Creates (or reuses) a pending refund for a cancelled booking (plan fee and
 * deposit together — they were one payment).
 *
 * No holding period: the deposit was never at risk, since no damage is
 * possible before pickup.
 *
 * Returns the refund's ID rather than the row — the caller
 * (bookings.service.ts) stores it on `booking_cancellations.refund_id`.
 */
export async function initiateCancellationRefund(
    subscriptionId: string,
    depositId: string | null,
    amount: number,
    actor: AuthContext | null,
): Promise<string> {
    const existing = await existingRefund(subscriptionId, "booking_cancellation");
    if (existing) return existing.id;

    const payment = await latestCapturedPayment(subscriptionId);
    if (!payment) throw businessRule("No captured payment found to refund against.");

    const { data, error: insertError } = await supabaseAdmin
        .from("refunds")
        .insert({
            user_id: payment.userId,
            payment_transaction_id: payment.id,
            amount,
            reason: "booking_cancellation",
            status: "pending",
        })
        .select(REFUND_COLUMNS)
        .single();
    if (insertError) throw insertError;
    const refund = toRefundRow(data as unknown as RawRefundRow, depositId);

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: refund.user_id, action: "refund.initiated",
        entityType: "refund", entityId: refund.id,
        after: { subscription_id: subscriptionId, amount, reason: "booking_cancellation" },
    });

    await notify({
        notificationType: "refund_needs_approval",
        referenceType: "refund",
        referenceId: refund.id,
        title: "Refund Needs Approval",
        bodyFallback: `A ₹${amount} cancellation refund for {rider} ({vehicle}) is awaiting approval.`,
        screen: "/refunds",
        bookingId: refund.booking_id ?? undefined,
        riderId: refund.user_id,
        riderNameOverride: refund.booking?.rider_name ?? undefined,
        vehicleNameOverride: refund.booking?.vehicle_model_name ?? undefined,
    });

    return refund.id;
}

async function markRefundFailed(refundId: string, reason: string): Promise<void> {
    await supabaseAdmin
        .from("refunds")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", refundId)
        .neq("status", "succeeded");
}

/**
 * The actual gateway call. Retryable: a failed attempt leaves the refund at
 * `failed` with `attempt_count` incremented, never marks the deposit
 * released, and can be called again.
 *
 * For a cancellation refund this doubles as the staff APPROVAL step — such a
 * refund is left `pending` with no automatic follow-up, so this is the first
 * time the gateway is contacted for it.
 *
 * The payment to reverse is read straight off the refund now. The old version
 * searched `invoices.gateway_ref` by `payment_type` at this point and failed
 * here if it found nothing; that search is gone.
 */
export async function processRefund(
    refundId: string,
    actor: AuthContext | null = null,
): Promise<RefundRow> {
    const refund = await readRefund(refundId);
    if (!refund) throw notFound("Refund not found.");
    if (refund.status === "succeeded") return toRefundRow(refund);
    if (refund.status === "processing") throw conflict("This refund is already being processed.");

    const { txn, subscription } = chainOf(refund);
    const sourcePaymentId = txn?.gateway_payment_id;
    if (!sourcePaymentId) {
        const message = "The payment this refund reverses has no gateway reference.";
        await markRefundFailed(refundId, message);
        throw businessRule(message);
    }

    await supabaseAdmin
        .from("refunds")
        .update({
            status: "processing",
            last_attempted_at: new Date().toISOString(),
            attempt_count: refund.attempt_count + 1,
        })
        .eq("id", refundId);

    try {
        const gatewayRefundId = isGatewayConfigured()
            ? (await getRazorpay().payments.refund(sourcePaymentId, {
                amount: rupeesToPaise(Number(refund.amount)),
                notes: { refund_id: refundId, reason: refund.reason },
            })).id
            : `mock_refund_${randomUUID()}`;

        const nowIso = new Date().toISOString();
        const { error: updateError } = await supabaseAdmin
            .from("refunds")
            .update({ status: "succeeded", gateway_refund_id: gatewayRefundId, completed_at: nowIso })
            .eq("id", refundId);
        if (updateError) throw updateError;

        if (subscription) {
            await releaseDepositIfFullyRefunded(subscription.id, Number(refund.amount));
        }

        await writeAudit({
            actorId: actor?.id ?? null, targetUserId: refund.user_id, action: "refund.processed",
            entityType: "refund", entityId: refundId, after: { gateway_refund_id: gatewayRefundId },
        });

        await notifyUser(refund.user_id, {
            template: "refund_completed",
            title: "Refund Completed",
            body: refund.reason === "booking_cancellation"
                ? `Your refund of ₹${Number(refund.amount)} for the cancelled booking has been completed.`
                : "Your security deposit refund has been completed.",
            screen: refund.reason === "booking_cancellation" ? "booking-history" : "my-plan",
        });

        const after = await readRefund(refundId);
        return toRefundRow(after ?? refund);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markRefundFailed(refundId, message);
        await writeAudit({
            actorId: actor?.id ?? null, targetUserId: refund.user_id, action: "refund.failed",
            entityType: "refund", entityId: refundId, after: { reason: message },
        });
        throw err;
    }
}

/**
 * Marks the deposit released once its money has actually gone back.
 *
 * `partially_refunded` no longer exists, so a partial return leaves the
 * deposit `held` until the rest is settled — which is more accurate than the
 * old flag, since a partly-refunded deposit genuinely still holds a balance.
 */
async function releaseDepositIfFullyRefunded(
    subscriptionId: string,
    refundAmount: number,
): Promise<void> {
    const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
    if (!deposit || deposit.status !== "held") return;
    if (round2(refundAmount) < round2(deposit.refundable_amount)) return;

    await supabaseAdmin
        .from("deposits")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "held");
}

/** Called from the webhook dispatch for refund.processed/refund.failed. Idempotent. */
export async function applyRefundWebhookResult(
    gatewayRefundId: string,
    outcome: "success" | "failed",
    failureReason?: string,
): Promise<void> {
    const { data: found, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("gateway_refund_id", gatewayRefundId)
        .maybeSingle();
    if (error) throw error;
    const refund = found as unknown as RawRefundRow | null;
    if (!refund || refund.status === "succeeded") return; // Unknown, or already applied.

    if (outcome === "success") {
        await supabaseAdmin
            .from("refunds")
            .update({ status: "succeeded", completed_at: new Date().toISOString() })
            .eq("id", refund.id)
            .neq("status", "succeeded");

        const { subscription } = chainOf(refund);
        if (subscription) {
            await releaseDepositIfFullyRefunded(subscription.id, Number(refund.amount));
        }

        await writeAudit({
            actorId: null, targetUserId: refund.user_id, action: "refund.processed",
            entityType: "refund", entityId: refund.id,
            after: { gateway_refund_id: gatewayRefundId, source: "webhook" },
        });
    } else {
        await markRefundFailed(refund.id, failureReason ?? "Refund failed at the gateway.");
        await writeAudit({
            actorId: null, targetUserId: refund.user_id, action: "refund.failed",
            entityType: "refund", entityId: refund.id, after: { source: "webhook" },
        });
    }
}

export async function listRefunds(filters: ListRefundsFilters): Promise<Paginated<RefundRow>> {
    let query = supabaseAdmin.from("refunds").select(REFUND_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.refundType) query = query.eq("reason", filters.refundType);

    // Filtering by booking is a three-hop path now, so it is resolved to a
    // subscription id first rather than expressed as an embedded filter.
    if (filters.bookingId) {
        const { data: sub, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("booking_id", filters.bookingId)
            .maybeSingle();
        if (subError) throw subError;
        if (!sub) return paginate([], 0, filters);
        query = query.eq("payment_transactions.payment_orders.subscription_id", sub.id);
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(
        ((data ?? []) as unknown as RawRefundRow[]).map((r) => toRefundRow(r)),
        count ?? 0,
        filters,
    );
}

export async function getRefundById(id: string): Promise<RefundRow> {
    const refund = await readRefund(id);
    if (!refund) throw notFound("Refund not found.");

    // The deposit is looked up rather than stored on the refund — see the
    // note on RefundRow.deposit_id.
    const { subscription } = chainOf(refund);
    const deposit = subscription ? await getDepositForSubscriptionOrNull(subscription.id) : null;
    return toRefundRow(refund, deposit?.id ?? null);
}

export interface RefundSettlementLine {
    id: string;
    description: string;
    amount: number;
    deposit_deduction: number;
    outstanding_amount: number;
    created_at: string;
}

export interface RefundSettlement {
    refund: RefundRow;
    depositAmount: number;
    lines: RefundSettlementLine[];
    totalDeduction: number;
    netRefund: number;
    additionalAmountDue: number;
}

/**
 * Full breakdown for the admin approval screen, so "Approve & Process Refund"
 * is never a blind click.
 *
 * `damages.deposit_deduction` and `outstanding_amount` are gone: a damage has
 * one assessed amount, and how it splits between the deposit and a separate
 * bill is the settlement's arithmetic, not a per-damage column. Both are
 * derived here, in order, against the deposit — which is what those columns
 * were trying to record and could get wrong.
 */
export async function getRefundSettlement(refundId: string): Promise<RefundSettlement> {
    const refund = await getRefundById(refundId);
    const raw = await readRefund(refundId);
    const { subscription } = raw ? chainOf(raw) : { subscription: null };
    if (!subscription) throw notFound("This refund is not linked to a subscription.");

    const deposit = await getDepositForSubscription(subscription.id);

    const { data: rentals, error: rentalsError } = await supabaseAdmin
        .from("rentals")
        .select("id")
        .eq("subscription_id", subscription.id);
    if (rentalsError) throw rentalsError;

    const rentalIds = (rentals ?? []).map((r) => r.id);
    const { data, error } = rentalIds.length
        ? await supabaseAdmin
            .from("damages")
            .select("id, assessed_amount, notes, created_at, incidents!inner(rental_id, description)")
            .in("incidents.rental_id", rentalIds)
            .neq("status", "disputed")
            .order("created_at", { ascending: true })
        : { data: [], error: null };
    if (error) throw error;

    // Deductions apply in order until the deposit is exhausted; whatever is
    // left of each line is billed separately.
    let remaining = deposit.amount;
    const lines: RefundSettlementLine[] = (data ?? []).map((row) => {
        const amount = Number(row.assessed_amount);
        const deduction = round2(Math.min(remaining, amount));
        remaining = round2(remaining - deduction);
        const incident = unwrap<{ description: string }>(row.incidents);
        return {
            id: row.id,
            description: row.notes ?? incident?.description ?? "",
            amount,
            deposit_deduction: deduction,
            outstanding_amount: round2(amount - deduction),
            created_at: row.created_at,
        };
    });

    return {
        refund,
        depositAmount: deposit.amount,
        lines,
        totalDeduction: round2(lines.reduce((sum, l) => sum + l.deposit_deduction, 0)),
        netRefund: refund.amount,
        additionalAmountDue: round2(lines.reduce((sum, l) => sum + l.outstanding_amount, 0)),
    };
}
