import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { env } from "../../config/env";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { getDepositForBooking, refundableAmountForBooking } from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import { ListRefundsFilters, RefundBookingSummary, RefundRow, RefundType } from "./refunds.types";

const REFUND_COLUMNS = `
    id, deposit_id, booking_id, amount, status, refund_type, gateway_refund_id, source_gateway_payment_id,
    attempt_count, last_attempted_at, failure_reason, initiated_at, processed_at, created_at,
    bookings(
        id, cancelled_at, cancellation_reason, cancellation_penalty_amount, plan_price_at_cancellation,
        vehicle_models(name), stations(name), users!bookings_user_id_fkey(full_name, phone)
    )
`;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

/** Same "no keys configured in dev" fallback payments.service.ts uses for order creation. */
function isGatewayConfigured(): boolean {
    return !!env.razorpayKeyId && !!env.razorpayKeySecret;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawRefundBooking {
    id: string;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    cancellation_penalty_amount: number | string | null;
    plan_price_at_cancellation: number | string | null;
    vehicle_models: unknown;
    stations: unknown;
    users: unknown;
}

interface RawRefundRow {
    id: string;
    deposit_id: string;
    booking_id: string;
    amount: number | string;
    status: RefundRow["status"];
    refund_type: RefundType;
    gateway_refund_id: string | null;
    source_gateway_payment_id: string | null;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    processed_at: string | null;
    created_at: string;
    bookings: unknown;
}

function toRefundBookingSummary(raw: unknown): RefundBookingSummary | null {
    const row = unwrap<RawRefundBooking>(raw);
    if (!row) return null;
    const rider = unwrap<{ full_name: string; phone: string | null }>(row.users);
    return {
        id: row.id,
        cancelled_at: row.cancelled_at,
        cancellation_reason: row.cancellation_reason,
        cancellation_penalty_amount: row.cancellation_penalty_amount == null ? null : Number(row.cancellation_penalty_amount),
        plan_price_at_cancellation: row.plan_price_at_cancellation == null ? null : Number(row.plan_price_at_cancellation),
        vehicle_model_name: unwrap<{ name: string }>(row.vehicle_models)?.name ?? null,
        station_name: unwrap<{ name: string }>(row.stations)?.name ?? null,
        rider_name: rider?.full_name ?? null,
        rider_phone: rider?.phone ?? null,
    };
}

function toRefundRow(row: RawRefundRow): RefundRow {
    const { bookings, ...rest } = row;
    return { ...rest, amount: Number(row.amount), booking: toRefundBookingSummary(bookings) };
}

/**
 * Creates (or reuses) a pending refund row for a held deposit. Does NOT call
 * the gateway — see processRefund for that. Enforces the 15-day
 * refund_eligible_at wait; not admin-overridable, per spec.
 */
export async function initiateRefund(depositId: string, actor: AuthContext | null): Promise<RefundRow> {
    const { data: deposit, error } = await supabaseAdmin
        .from("deposits")
        .select("id, booking_id, amount, status, refund_eligible_at")
        .eq("id", depositId)
        .maybeSingle();
    if (error) throw error;
    if (!deposit) throw notFound("Deposit not found.");
    if (deposit.status !== "held") {
        throw businessRule("Only a held deposit can be refunded.");
    }
    if (!deposit.refund_eligible_at || new Date(deposit.refund_eligible_at) > new Date()) {
        throw businessRule("This deposit is not yet eligible for refund — it must wait out the post-return holding period.");
    }

    const { data: existing, error: existingError } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("deposit_id", depositId)
        .in("status", ["pending", "processing", "success"])
        .order("created_at", { ascending: false })
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return toRefundRow(existing as unknown as RawRefundRow);

    const amount = await refundableAmountForBooking(deposit.booking_id, Number(deposit.amount));
    if (amount <= 0) {
        throw businessRule("Nothing is left to refund on this deposit.");
    }

    const { data, error: insertError } = await supabaseAdmin
        .from("refunds")
        .insert({ deposit_id: depositId, booking_id: deposit.booking_id, amount, status: "pending" })
        .select(REFUND_COLUMNS)
        .single();
    if (insertError) throw insertError;
    const refund = toRefundRow(data as unknown as RawRefundRow);

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: null, action: "refund.initiated",
        entityType: "refund", entityId: refund.id, after: { deposit_id: depositId, amount },
    });

    const bookingUserId = await getBookingUserId(deposit.booking_id);
    if (bookingUserId) {
        await notifyUser(bookingUserId, {
            template: "refund_initiated",
            title: "Refund Initiated",
            body: `Your security deposit refund of ₹${amount} has been initiated.`,
            screen: "my-plan",
        });
    }

    await notify({
        notificationType: "refund",
        referenceType: "refund",
        referenceId: refund.id,
        template: "refund_needs_approval",
        title: "Refund Needs Approval",
        bodyFallback: `A ₹${amount} deposit refund for {rider} ({vehicle}) is awaiting approval.`,
        screen: "/refunds",
        bookingId: deposit.booking_id,
        riderId: bookingUserId ?? undefined,
        riderNameOverride: refund.booking?.rider_name ?? undefined,
        vehicleNameOverride: refund.booking?.vehicle_model_name ?? undefined,
    });

    return refund;
}

/**
 * Creates (or reuses) a pending refund row for a booking-cancellation refund
 * (rental + deposit, refunded together — see 20260815100000_refund_type_enum.sql).
 * Unlike initiateRefund, there's no 15-day refund_eligible_at wait: the
 * deposit was never at risk (no damage is possible before pickup), so this
 * refund is meant to fire the same day, generally the same request, as the
 * cancellation itself.
 */
export async function initiateCancellationRefund(
    bookingId: string, depositId: string, amount: number, actor: AuthContext | null,
): Promise<RefundRow> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("booking_id", bookingId)
        .eq("refund_type", "booking_cancellation")
        .in("status", ["pending", "processing", "success"])
        .order("created_at", { ascending: false })
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return toRefundRow(existing as unknown as RawRefundRow);

    const { data, error: insertError } = await supabaseAdmin
        .from("refunds")
        .insert({ deposit_id: depositId, booking_id: bookingId, amount, status: "pending", refund_type: "booking_cancellation" })
        .select(REFUND_COLUMNS)
        .single();
    if (insertError) throw insertError;
    const refund = toRefundRow(data as unknown as RawRefundRow);

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: null, action: "refund.initiated",
        entityType: "refund", entityId: refund.id, after: { booking_id: bookingId, amount, refund_type: "booking_cancellation" },
    });

    const bookingUserId = await getBookingUserId(bookingId);
    await notify({
        notificationType: "refund",
        referenceType: "refund",
        referenceId: refund.id,
        template: "refund_needs_approval",
        title: "Refund Needs Approval",
        bodyFallback: `A ₹${amount} cancellation refund for {rider} ({vehicle}) is awaiting approval.`,
        screen: "/refunds",
        bookingId,
        riderId: bookingUserId ?? undefined,
        riderNameOverride: refund.booking?.rider_name ?? undefined,
        vehicleNameOverride: refund.booking?.vehicle_model_name ?? undefined,
    });

    return refund;
}

async function getBookingUserId(bookingId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from("bookings").select("user_id").eq("id", bookingId).maybeSingle();
    return (data?.user_id as string) ?? null;
}

async function markRefundFailed(refundId: string, refundType: RefundType, bookingId: string, reason: string): Promise<void> {
    await supabaseAdmin
        .from("refunds")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", refundId)
        .neq("status", "success");

    if (refundType === "booking_cancellation") {
        await supabaseAdmin
            .from("bookings")
            .update({ refund_status: "failed" })
            .eq("id", bookingId)
            .eq("refund_status", "processing");
    }
}

/**
 * The actual gateway call. Retryable: a failed attempt leaves the refund row
 * at status='failed' with attempt_count incremented, never marks the
 * deposit refunded, and can be called again (see the failed-refund-retry job,
 * or POST /refunds/:id/retry for either refund_type).
 *
 * For a booking_cancellation refund this doubles as the staff APPROVAL step:
 * such a refund is deliberately left at status='pending' by
 * initiateCancellationRefund with no automatic follow-up call, so this is the
 * first time the gateway is ever contacted for it — driven only by an admin
 * hitting Approve/Retry (or the cron sweep, for deposit refunds). `actor` is
 * who triggered this call, for the audit trail; null for automated callers
 * (cron jobs, webhook confirmation).
 *
 * No Razorpay keys configured (see isGatewayConfigured — same posture as
 * payments.service.ts's order creation): settles instantly with a synthetic
 * mock_refund_<uuid> id instead of calling out, so dev/QA can exercise the
 * whole cancellation -> refund flow without real gateway credentials.
 */
export async function processRefund(refundId: string, actor: AuthContext | null = null): Promise<RefundRow> {
    const { data: refund, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("id", refundId)
        .maybeSingle();
    if (error) throw error;
    if (!refund) throw notFound("Refund not found.");
    if (refund.status === "success") return toRefundRow(refund as unknown as RawRefundRow);
    if (refund.status === "processing") throw conflict("This refund is already being processed.");

    const sourcePaymentType = refund.refund_type === "booking_cancellation" ? "rental" : "deposit";
    const { data: sourceInvoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("gateway_ref")
        .eq("booking_id", refund.booking_id)
        .eq("payment_type", sourcePaymentType)
        .eq("payment_status", "succeeded")
        .maybeSingle();
    if (invoiceError) throw invoiceError;
    const sourcePaymentId = sourceInvoice?.gateway_ref ?? null;
    if (!sourcePaymentId) {
        const message = `No captured ${sourcePaymentType} payment found to refund against.`;
        await markRefundFailed(refundId, refund.refund_type, refund.booking_id, message);
        throw businessRule(message);
    }

    await supabaseAdmin
        .from("refunds")
        .update({
            status: "processing",
            last_attempted_at: new Date().toISOString(),
            attempt_count: refund.attempt_count + 1,
            source_gateway_payment_id: sourcePaymentId,
        })
        .eq("id", refundId);

    try {
        const gatewayRefundId = isGatewayConfigured()
            ? (await getRazorpay().payments.refund(sourcePaymentId, {
                amount: rupeesToPaise(Number(refund.amount)),
                notes: { deposit_id: refund.deposit_id, refund_id: refundId, refund_type: refund.refund_type },
            })).id
            : `mock_refund_${randomUUID()}`;

        const nowIso = new Date().toISOString();
        const { data: updated, error: updateError } = await supabaseAdmin
            .from("refunds")
            .update({ status: "success", gateway_refund_id: gatewayRefundId, processed_at: nowIso })
            .eq("id", refundId)
            .select(REFUND_COLUMNS)
            .single();
        if (updateError) throw updateError;

        await applyRefundSuccessToDeposit(refund.deposit_id, refund.booking_id, Number(refund.amount), refundId);
        await markInvoicesRefunded(refund.booking_id, refund.refund_type);
        if (refund.refund_type === "booking_cancellation") {
            await applyCancellationRefundSuccessToBooking(refund.booking_id, nowIso, gatewayRefundId);
        }

        await writeAudit({
            actorId: actor?.id ?? null, targetUserId: null, action: "refund.processed",
            entityType: "refund", entityId: refundId, after: { gateway_refund_id: gatewayRefundId },
        });

        const userId = await getBookingUserId(refund.booking_id);
        if (userId) {
            await notifyUser(userId, {
                template: "refund_completed",
                title: "Refund Completed",
                body: refund.refund_type === "booking_cancellation"
                    ? `Your refund of ₹${Number(refund.amount)} for the cancelled booking has been completed.`
                    : "Your security deposit refund has been completed.",
                screen: refund.refund_type === "booking_cancellation" ? "booking-history" : "my-plan",
            });
        }

        return toRefundRow(updated as unknown as RawRefundRow);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markRefundFailed(refundId, refund.refund_type, refund.booking_id, message);
        await writeAudit({
            actorId: actor?.id ?? null, targetUserId: null, action: "refund.failed",
            entityType: "refund", entityId: refundId, after: { reason: message },
        });
        throw err;
    }
}

async function applyRefundSuccessToDeposit(
    depositId: string, bookingId: string, refundAmount: number, refundId: string,
): Promise<void> {
    const { data: deposit } = await supabaseAdmin.from("deposits").select("amount").eq("id", depositId).maybeSingle();
    const fully = deposit ? round2(refundAmount) >= round2(Number(deposit.amount)) : true;

    await supabaseAdmin
        .from("deposits")
        .update({
            status: fully ? "refunded" : "partially_refunded",
            refunded_at: new Date().toISOString(),
            refund_id: refundId,
        })
        .eq("id", depositId)
        .eq("booking_id", bookingId);
}

async function applyCancellationRefundSuccessToBooking(
    bookingId: string, completedAt: string, gatewayRefundId: string,
): Promise<void> {
    await supabaseAdmin
        .from("bookings")
        .update({ refund_status: "processed", refund_completed_at: completedAt, refund_transaction_id: gatewayRefundId })
        .eq("id", bookingId)
        .eq("refund_status", "processing");
}

/**
 * The Payments screen (apps/web PaymentsPage) reads invoices.payment_status
 * directly — a deposit refund only ever refunds the 'deposit' invoice, but a
 * booking_cancellation refund pays back the single combined Razorpay payment
 * that settled BOTH the 'rental' and 'deposit' invoices (see
 * vehicle-catalog/bookings checkout — one order, one captured payment), so
 * both must flip to 'refunded' together.
 */
async function markInvoicesRefunded(bookingId: string, refundType: RefundType): Promise<void> {
    const paymentTypes = refundType === "booking_cancellation" ? ["rental", "deposit"] : ["deposit"];
    await supabaseAdmin
        .from("invoices")
        .update({ payment_status: "refunded" })
        .eq("booking_id", bookingId)
        .in("payment_type", paymentTypes)
        .eq("payment_status", "succeeded");
}

/** Called from payments.service.ts's webhook dispatch for refund.processed/refund.failed — authoritative confirmation, idempotent. */
export async function applyRefundWebhookResult(
    gatewayRefundId: string, outcome: "success" | "failed", failureReason?: string,
): Promise<void> {
    const { data: refund, error } = await supabaseAdmin
        .from("refunds")
        .select("id, deposit_id, booking_id, amount, status, refund_type")
        .eq("gateway_refund_id", gatewayRefundId)
        .maybeSingle();
    if (error) throw error;
    if (!refund || refund.status === "success") return; // Unknown to us, or already applied — no-op.

    if (outcome === "success") {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
            .from("refunds")
            .update({ status: "success", processed_at: nowIso })
            .eq("id", refund.id)
            .neq("status", "success");
        await applyRefundSuccessToDeposit(refund.deposit_id, refund.booking_id, Number(refund.amount), refund.id);
        await markInvoicesRefunded(refund.booking_id, refund.refund_type);
        if (refund.refund_type === "booking_cancellation") {
            await applyCancellationRefundSuccessToBooking(refund.booking_id, nowIso, gatewayRefundId);
        }
        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.processed",
            entityType: "refund", entityId: refund.id, after: { gateway_refund_id: gatewayRefundId, source: "webhook" },
        });
    } else {
        await markRefundFailed(refund.id, refund.refund_type, refund.booking_id, failureReason ?? "Refund failed at the gateway.");
        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.failed",
            entityType: "refund", entityId: refund.id, after: { source: "webhook" },
        });
    }
}

export async function listRefunds(filters: ListRefundsFilters): Promise<Paginated<RefundRow>> {
    let query = supabaseAdmin.from("refunds").select(REFUND_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.refundType) query = query.eq("refund_type", filters.refundType);
    if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawRefundRow[]).map(toRefundRow), count ?? 0, filters);
}

export async function getRefundById(id: string): Promise<RefundRow> {
    const { data, error } = await supabaseAdmin.from("refunds").select(REFUND_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Refund not found.");
    return toRefundRow(data as unknown as RawRefundRow);
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
    /** Sum of every line's outstanding_amount — what's billed separately because deductions exceeded the deposit. */
    additionalAmountDue: number;
}

/**
 * Full breakdown for the admin approval screen — deposit amount, every
 * non-disputed damage line with its own reason/amount, and the computed
 * totals, so "Approve & Process Refund" is never a blind click. Deposit
 * Refund & Damage Deduction Phase 1.
 */
export async function getRefundSettlement(refundId: string): Promise<RefundSettlement> {
    const refund = await getRefundById(refundId);
    const deposit = await getDepositForBooking(refund.booking_id);

    const { data, error } = await supabaseAdmin
        .from("damages")
        .select("id, description, amount, deposit_deduction, outstanding_amount, created_at")
        .eq("booking_id", refund.booking_id)
        .neq("status", "disputed");
    if (error) throw error;

    const lines = (data ?? []).map((row) => ({
        id: row.id as string,
        description: row.description as string,
        amount: Number(row.amount),
        deposit_deduction: Number(row.deposit_deduction),
        outstanding_amount: Number(row.outstanding_amount),
        created_at: row.created_at as string,
    }));

    return {
        refund,
        depositAmount: deposit.amount,
        lines,
        totalDeduction: round2(lines.reduce((sum, l) => sum + l.deposit_deduction, 0)),
        netRefund: refund.amount,
        additionalAmountDue: round2(lines.reduce((sum, l) => sum + l.outstanding_amount, 0)),
    };
}
