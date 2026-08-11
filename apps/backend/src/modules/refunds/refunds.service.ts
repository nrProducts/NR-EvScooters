import { supabaseAdmin } from "../../config/supabase";
import { getRazorpay } from "../../config/razorpay";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { refundableAmountForBooking } from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import { ListRefundsFilters, RefundRow } from "./refunds.types";

const REFUND_COLUMNS = `
    id, deposit_id, booking_id, amount, status, gateway_refund_id, source_gateway_payment_id,
    attempt_count, last_attempted_at, failure_reason, initiated_at, processed_at, created_at
`;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const rupeesToPaise = (rupees: number): number => Math.round(rupees * 100);

interface RawRefundRow {
    id: string;
    deposit_id: string;
    booking_id: string;
    amount: number | string;
    status: RefundRow["status"];
    gateway_refund_id: string | null;
    source_gateway_payment_id: string | null;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    processed_at: string | null;
    created_at: string;
}

function toRefundRow(row: RawRefundRow): RefundRow {
    return { ...row, amount: Number(row.amount) };
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

    return refund;
}

async function getBookingUserId(bookingId: string): Promise<string | null> {
    const { data } = await supabaseAdmin.from("bookings").select("user_id").eq("id", bookingId).maybeSingle();
    return (data?.user_id as string) ?? null;
}

async function markRefundFailed(refundId: string, reason: string): Promise<void> {
    await supabaseAdmin
        .from("refunds")
        .update({ status: "failed", failure_reason: reason })
        .eq("id", refundId)
        .neq("status", "success");
}

/**
 * The actual gateway call. Retryable: a failed attempt leaves the refund row
 * at status='failed' with attempt_count incremented, never marks the
 * deposit refunded, and can be called again (see the failed-refund-retry job).
 */
export async function processRefund(refundId: string): Promise<RefundRow> {
    const { data: refund, error } = await supabaseAdmin
        .from("refunds")
        .select(REFUND_COLUMNS)
        .eq("id", refundId)
        .maybeSingle();
    if (error) throw error;
    if (!refund) throw notFound("Refund not found.");
    if (refund.status === "success") return toRefundRow(refund as unknown as RawRefundRow);
    if (refund.status === "processing") throw conflict("This refund is already being processed.");

    const { data: depositInvoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("gateway_ref")
        .eq("booking_id", refund.booking_id)
        .eq("payment_type", "deposit")
        .eq("payment_status", "succeeded")
        .maybeSingle();
    if (invoiceError) throw invoiceError;
    const sourcePaymentId = depositInvoice?.gateway_ref ?? null;
    if (!sourcePaymentId) {
        await markRefundFailed(refundId, "No captured deposit payment found to refund against.");
        throw businessRule("No captured deposit payment found to refund against.");
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
        const razorpay = getRazorpay();
        const gatewayRefund = await razorpay.payments.refund(sourcePaymentId, {
            amount: rupeesToPaise(Number(refund.amount)),
            notes: { deposit_id: refund.deposit_id, refund_id: refundId },
        });

        const { data: updated, error: updateError } = await supabaseAdmin
            .from("refunds")
            .update({ status: "success", gateway_refund_id: gatewayRefund.id, processed_at: new Date().toISOString() })
            .eq("id", refundId)
            .select(REFUND_COLUMNS)
            .single();
        if (updateError) throw updateError;

        await applyRefundSuccessToDeposit(refund.deposit_id, refund.booking_id, Number(refund.amount), refundId);

        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.processed",
            entityType: "refund", entityId: refundId, after: { gateway_refund_id: gatewayRefund.id },
        });

        const userId = await getBookingUserId(refund.booking_id);
        if (userId) {
            await notifyUser(userId, {
                template: "refund_completed",
                title: "Refund Completed",
                body: "Your security deposit refund has been completed.",
                screen: "my-plan",
            });
        }

        return toRefundRow(updated as unknown as RawRefundRow);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await markRefundFailed(refundId, message);
        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.failed",
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

/** Called from payments.service.ts's webhook dispatch for refund.processed/refund.failed — authoritative confirmation, idempotent. */
export async function applyRefundWebhookResult(
    gatewayRefundId: string, outcome: "success" | "failed", failureReason?: string,
): Promise<void> {
    const { data: refund, error } = await supabaseAdmin
        .from("refunds")
        .select("id, deposit_id, booking_id, amount, status")
        .eq("gateway_refund_id", gatewayRefundId)
        .maybeSingle();
    if (error) throw error;
    if (!refund || refund.status === "success") return; // Unknown to us, or already applied — no-op.

    if (outcome === "success") {
        await supabaseAdmin
            .from("refunds")
            .update({ status: "success", processed_at: new Date().toISOString() })
            .eq("id", refund.id)
            .neq("status", "success");
        await applyRefundSuccessToDeposit(refund.deposit_id, refund.booking_id, Number(refund.amount), refund.id);
        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.processed",
            entityType: "refund", entityId: refund.id, after: { gateway_refund_id: gatewayRefundId, source: "webhook" },
        });
    } else {
        await markRefundFailed(refund.id, failureReason ?? "Refund failed at the gateway.");
        await writeAudit({
            actorId: null, targetUserId: null, action: "refund.failed",
            entityType: "refund", entityId: refund.id, after: { source: "webhook" },
        });
    }
}

export async function listRefunds(filters: ListRefundsFilters): Promise<Paginated<RefundRow>> {
    let query = supabaseAdmin.from("refunds").select(REFUND_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);
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

/** Admin "Refund" action — creates (or reuses) the pending row, then drives it through the gateway synchronously. */
export async function refundDeposit(depositId: string, actor: AuthContext): Promise<RefundRow> {
    const refund = await initiateRefund(depositId, actor);
    if (refund.status === "pending" || refund.status === "failed") {
        return processRefund(refund.id);
    }
    return refund;
}
