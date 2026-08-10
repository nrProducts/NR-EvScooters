import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { env } from "../../config/env";
import { Paginated } from "../../types";
import { DepositRow, ListDepositsFilters } from "./deposits.types";

const DEPOSIT_COLUMNS = `
    id, booking_id, amount, status, held_at, refund_eligible_at, refunded_at, forfeited_at, refund_id, created_at
`;

interface RawDepositRow {
    id: string;
    booking_id: string;
    amount: number | string;
    status: DepositRow["status"];
    held_at: string | null;
    refund_eligible_at: string | null;
    refunded_at: string | null;
    forfeited_at: string | null;
    refund_id: string | null;
    created_at: string;
}

/** Sum of deposit_deduction across this booking's non-disputed damages — the actually-refundable portion of the held deposit. */
export async function refundableAmountForBooking(bookingId: string, depositAmount: number): Promise<number> {
    const { data, error } = await supabaseAdmin
        .from("damages")
        .select("deposit_deduction")
        .eq("booking_id", bookingId)
        .neq("status", "disputed");
    if (error) throw error;

    const totalDeduction = (data ?? []).reduce((sum, row) => sum + Number(row.deposit_deduction), 0);
    return Math.max(0, Math.round((depositAmount - totalDeduction) * 100) / 100);
}

async function toDepositRow(row: RawDepositRow): Promise<DepositRow> {
    const amount = Number(row.amount);
    return {
        ...row,
        amount,
        refundable_amount: row.status === "held" ? await refundableAmountForBooking(row.booking_id, amount) : amount,
    };
}

export async function getDepositForBooking(bookingId: string): Promise<DepositRow> {
    const { data, error } = await supabaseAdmin
        .from("deposits")
        .select(DEPOSIT_COLUMNS)
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("No deposit found for this booking.");
    return toDepositRow(data as unknown as RawDepositRow);
}

export async function getDepositForBookingOrNull(bookingId: string): Promise<DepositRow | null> {
    const { data, error } = await supabaseAdmin
        .from("deposits")
        .select(DEPOSIT_COLUMNS)
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    return data ? toDepositRow(data as unknown as RawDepositRow) : null;
}

export async function listDeposits(filters: ListDepositsFilters): Promise<Paginated<DepositRow>> {
    let query = supabaseAdmin.from("deposits").select(DEPOSIT_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.refundEligible) {
        query = query.eq("status", "held").lte("refund_eligible_at", new Date().toISOString());
    }

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = await Promise.all(((data ?? []) as unknown as RawDepositRow[]).map(toDepositRow));
    return paginate(rows, count ?? 0, filters);
}

/**
 * Fully consumed by damage deductions — nothing left to refund. Called after
 * a damage record is written/resolved; a no-op once the deposit has already
 * moved past 'held' (refunded/partially_refunded are terminal here, and a
 * dispute in flight must not flip status early).
 */
export async function recomputeDepositStatusForBooking(bookingId: string): Promise<void> {
    const { data: deposit, error } = await supabaseAdmin
        .from("deposits")
        .select("id, amount, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!deposit || deposit.status !== "held") return;

    const remaining = await refundableAmountForBooking(bookingId, Number(deposit.amount));
    if (remaining <= 0) {
        await supabaseAdmin
            .from("deposits")
            .update({ status: "forfeited", forfeited_at: new Date().toISOString() })
            .eq("id", deposit.id)
            .eq("status", "held");
    }
}

/**
 * Starts the 15-day refund-eligibility clock. Called from rentals.service.ts's
 * completeRide, but ONLY for a genuine final return — see that call site's
 * comment for how it distinguishes a real return from a maintenance-internal
 * temp-vehicle rental closure. A no-op if the deposit was already forfeited
 * (nothing to refund) or this booking never had a deposit at all.
 */
export async function setDepositRefundEligible(bookingId: string, returnedAt: Date): Promise<void> {
    const eligible = new Date(returnedAt);
    eligible.setDate(eligible.getDate() + env.depositRefundEligibilityDays);

    await supabaseAdmin
        .from("deposits")
        .update({ refund_eligible_at: eligible.toISOString() })
        .eq("booking_id", bookingId)
        .eq("status", "held")
        .is("refund_eligible_at", null);
}
