import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { env } from "../../config/env";
import { Paginated } from "../../types";
import { DepositRow, ListDepositsFilters } from "./deposits.types";
import { businessToday } from "../../common/dates";

/**
 * Security deposits.
 *
 * The deposit hangs off the SUBSCRIPTION now, not the booking — it is taken
 * when payment creates the agreement, and it survives every renewal, so
 * pinning it to the reservation was always slightly wrong.
 *
 * `refund_id` is gone too. A refund names the payment it reverses
 * (`payment_transaction_id`), and pointing back from the deposit as well made
 * two places responsible for the same link.
 */

const DEPOSIT_COLUMNS = `
    id, subscription_id, amount, status, held_at, refund_eligible_on,
    released_at, forfeited_at, forfeit_reason, created_at
`;

interface RawDepositRow {
    id: string;
    subscription_id: string;
    amount: number | string;
    status: DepositRow["status"];
    held_at: string | null;
    refund_eligible_on: string | null;
    released_at: string | null;
    forfeited_at: string | null;
    forfeit_reason: string | null;
    created_at: string;
}

/**
 * Non-disputed damage assessed against this subscription's rentals.
 *
 * `damages.deposit_deduction` is gone, so this sums `assessed_amount` — the
 * full assessed charge — reached through `incidents.rental_id`. The two were
 * almost always equal; where they were not, the deduction column was a
 * hand-maintained opinion about how much of the damage the deposit should
 * cover, which is exactly what the settlement arithmetic now decides.
 */
export async function refundableAmountForSubscription(
    subscriptionId: string,
    depositAmount: number,
): Promise<number> {
    const { data: rentals, error: rentalsError } = await supabaseAdmin
        .from("rentals")
        .select("id")
        .eq("subscription_id", subscriptionId);
    if (rentalsError) throw rentalsError;

    const rentalIds = (rentals ?? []).map((r) => r.id);
    if (rentalIds.length === 0) return Math.max(0, depositAmount);

    const { data, error } = await supabaseAdmin
        .from("damages")
        .select("assessed_amount, incidents!inner(rental_id)")
        .in("incidents.rental_id", rentalIds)
        .neq("status", "disputed");
    if (error) throw error;

    const totalDamage = (data ?? []).reduce((sum, row) => sum + Number(row.assessed_amount), 0);
    return Math.max(0, Math.round((depositAmount - totalDamage) * 100) / 100);
}

async function toDepositRow(row: RawDepositRow): Promise<DepositRow> {
    const amount = Number(row.amount);
    return {
        id: row.id,
        subscription_id: row.subscription_id,
        amount,
        status: row.status,
        held_at: row.held_at,
        refund_eligible_at: row.refund_eligible_on,
        refunded_at: row.released_at,
        forfeited_at: row.forfeited_at,
        forfeit_reason: row.forfeit_reason,
        refundable_amount: row.status === "held"
            ? await refundableAmountForSubscription(row.subscription_id, amount)
            : amount,
        created_at: row.created_at,
    };
}

export async function getDepositForSubscription(subscriptionId: string): Promise<DepositRow> {
    const deposit = await getDepositForSubscriptionOrNull(subscriptionId);
    if (!deposit) throw notFound("No deposit found for this subscription.");
    return deposit;
}

export async function getDepositForSubscriptionOrNull(
    subscriptionId: string,
): Promise<DepositRow | null> {
    const { data, error } = await supabaseAdmin
        .from("deposits")
        .select(DEPOSIT_COLUMNS)
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    return data ? toDepositRow(data as unknown as RawDepositRow) : null;
}

/**
 * Convenience for the callers that still hold a booking id (the admin console
 * addresses everything by booking). One hop through `subscriptions`.
 */
export async function getDepositForBookingOrNull(bookingId: string): Promise<DepositRow | null> {
    const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return getDepositForSubscriptionOrNull(data.id);
}

export async function listDeposits(filters: ListDepositsFilters): Promise<Paginated<DepositRow>> {
    let query = supabaseAdmin.from("deposits").select(DEPOSIT_COLUMNS, { count: "exact" });
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.refundEligible) {
        // `refund_eligible_on` is a DATE, so this compares against today's
        // date rather than an instant — a deposit becomes eligible at the
        // start of its eligible day, not at the same clock time it was set.
        query = query
            .eq("status", "held")
            .lte("refund_eligible_on", businessToday());
    }

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    const rows = await Promise.all(((data ?? []) as unknown as RawDepositRow[]).map(toDepositRow));
    return paginate(rows, count ?? 0, filters);
}

/**
 * Fully consumed by damage — nothing left to refund. Called after a damage
 * record is written or resolved; a no-op once the deposit has moved past
 * `held`, so a dispute in flight cannot flip the status early.
 */
export async function recomputeDepositStatusForSubscription(subscriptionId: string): Promise<void> {
    const { data: deposit, error } = await supabaseAdmin
        .from("deposits")
        .select("id, amount, status")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!deposit || deposit.status !== "held") return;

    const remaining = await refundableAmountForSubscription(subscriptionId, Number(deposit.amount));
    if (remaining <= 0) {
        await supabaseAdmin
            .from("deposits")
            .update({
                status: "forfeited",
                forfeited_at: new Date().toISOString(),
                forfeit_reason: "Fully consumed by assessed damage.",
            })
            .eq("id", deposit.id)
            .eq("status", "held");
    }
}

/**
 * Starts the refund-eligibility clock.
 *
 * Called from completeRide for a genuine final return. That used to need a
 * careful check to avoid firing on a maintenance-internal rental closure; it
 * no longer does, because a maintenance swap keeps the same rental.
 *
 * A no-op if the deposit was already forfeited or the clock is already
 * running.
 */
export async function setDepositRefundEligible(
    subscriptionId: string,
    returnedAt: Date,
): Promise<void> {
    const eligible = new Date(returnedAt);
    eligible.setDate(eligible.getDate() + env.depositRefundEligibilityDays);

    await supabaseAdmin
        .from("deposits")
        .update({ refund_eligible_on: businessToday(eligible) })
        .eq("subscription_id", subscriptionId)
        .eq("status", "held")
        .is("refund_eligible_on", null);
}
