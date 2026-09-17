import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { env } from "../../config/env";
import { writeAudit } from "../../common/audit";
import { notify } from "../notifications/notify.service";
import { cumulativeRentalDaysForUser } from "../rentals/rentalDays";
import { Paginated } from "../../types";
import { DepositRefundEligibility, DepositRow, ListDepositsFilters } from "./deposits.types";
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

// The rider and their booking come along because a deposit on its own is not
// identifiable: `subscription_id` is not something staff can look at and know
// whose money it is.
const DEPOSIT_COLUMNS = `
    id, subscription_id, amount, status, held_at, refund_eligible_on,
    released_at, forfeited_at, forfeit_reason, min_rental_days_required,
    created_at,
    subscriptions!inner(
        user_id,
        users(id, full_name, phone),
        bookings(id, onboarding_charge_snapshot, plans(vehicle_models(name)))
    )
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
    min_rental_days_required: number | string | null;
    created_at: string;
    /** Joined so eligibility can be measured without a second round trip. */
    subscriptions: RawSubscriptionSlice | RawSubscriptionSlice[] | null;
}

interface RawSubscriptionSlice {
    user_id: string;
    users?: { id: string; full_name: string; phone: string | null }
        | { id: string; full_name: string; phone: string | null }[] | null;
    bookings?: RawBookingSlice | RawBookingSlice[] | null;
}

interface RawBookingSlice {
    id: string;
    onboarding_charge_snapshot: number | string | null;
    plans?: { vehicle_models?: { name: string } | { name: string }[] | null }
        | { vehicle_models?: { name: string } | { name: string }[] | null }[] | null;
}

const one = <T,>(raw: T | T[] | null | undefined): T | null =>
    (Array.isArray(raw) ? raw[0] : raw) ?? null;

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

/**
 * May this deposit be paid back yet?
 *
 * Two gates, and both have to be open. The day threshold is the rider's
 * side of the bargain; `refund_eligible_on` is the existing cooling-off
 * period that starts at return. A deposit still `held` with no return
 * behind it is simply not there yet — the rider is still riding.
 */
export function deriveEligibility(
    status: DepositRow["status"],
    refundEligibleOn: string | null,
    minRentalDays: number,
    rentalDaysCompleted: number,
): DepositRefundEligibility {
    if (status === "released") return "refund_processed";
    if (status !== "held") return "not_eligible";
    if (minRentalDays > 0 && rentalDaysCompleted < minRentalDays) return "not_eligible";
    if (!refundEligibleOn || refundEligibleOn > businessToday()) return "not_eligible";
    return "eligible";
}

async function toDepositRow(row: RawDepositRow): Promise<DepositRow> {
    const amount = Number(row.amount);
    const minRentalDays = Number(row.min_rental_days_required ?? 0);
    const subscription = one(row.subscriptions);

    // Only counted when there is a threshold to measure against. Deposits
    // taken before the split carry 0 and cost no extra query.
    const rentalDaysCompleted = minRentalDays > 0 && subscription
        ? await cumulativeRentalDaysForUser(subscription.user_id)
        : 0;

    const rider = one(subscription?.users);
    const booking = one(subscription?.bookings);
    const vehicleModel = one(one(booking?.plans)?.vehicle_models);

    return {
        rider: rider
            ? { id: rider.id, full_name: rider.full_name, phone: rider.phone }
            : null,
        booking_id: booking?.id ?? null,
        vehicle_model_name: vehicleModel?.name ?? null,
        onboarding_charge_amount: Number(booking?.onboarding_charge_snapshot ?? 0),
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
        min_rental_days_required: minRentalDays,
        rental_days_completed: rentalDaysCompleted,
        refund_eligibility: deriveEligibility(
            row.status, row.refund_eligible_on, minRentalDays, rentalDaysCompleted,
        ),
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
 * Settles the deposit at the end of a rental — the fork where it either
 * starts its refund clock or is forfeited outright.
 *
 * Called from completeRide for a genuine final return. That used to need a
 * careful check to avoid firing on a maintenance-internal rental closure; it
 * no longer does, because a maintenance swap keeps the same rental.
 *
 * The rider who finishes short of the plan's minimum rental days loses this
 * deposit. That is real money, so it is audited and the rider is told, the
 * same way any other forfeit is — never a silent field update.
 *
 * A no-op if the deposit was already forfeited or released, or if the clock
 * is already running.
 */
export async function settleDepositOnReturn(
    subscriptionId: string,
    returnedAt: Date,
    actorId: string,
): Promise<void> {
    const { data: deposit, error } = await supabaseAdmin
        .from("deposits")
        .select("id, amount, min_rental_days_required, refund_eligible_on, subscriptions!inner(user_id)")
        .eq("subscription_id", subscriptionId)
        .eq("status", "held")
        .maybeSingle();
    if (error) throw error;
    if (!deposit || deposit.refund_eligible_on) return;

    const subscription = Array.isArray(deposit.subscriptions)
        ? deposit.subscriptions[0]
        : deposit.subscriptions;
    const minRentalDays = Number(deposit.min_rental_days_required ?? 0);

    if (minRentalDays > 0 && subscription) {
        const daysCompleted = await cumulativeRentalDaysForUser(subscription.user_id, returnedAt);
        if (daysCompleted < minRentalDays) {
            await forfeitForShortRental(
                { id: deposit.id, amount: Number(deposit.amount), userId: subscription.user_id },
                { daysCompleted, minRentalDays, actorId },
            );
            return;
        }
    }

    const eligible = new Date(returnedAt);
    eligible.setDate(eligible.getDate() + env.depositRefundEligibilityDays);

    await supabaseAdmin
        .from("deposits")
        .update({ refund_eligible_on: businessToday(eligible) })
        .eq("subscription_id", subscriptionId)
        .eq("status", "held")
        .is("refund_eligible_on", null);
}

async function forfeitForShortRental(
    deposit: { id: string; amount: number; userId: string },
    context: { daysCompleted: number; minRentalDays: number; actorId: string },
): Promise<void> {
    const { daysCompleted, minRentalDays, actorId } = context;
    const reason =
        `Returned after ${daysCompleted} rental day(s), short of the ${minRentalDays} ` +
        "required for this plan's security deposit to be refundable.";

    const { error } = await supabaseAdmin
        .from("deposits")
        .update({
            status: "forfeited",
            forfeited_at: new Date().toISOString(),
            forfeit_reason: reason,
        })
        .eq("id", deposit.id)
        // Re-checked here, not just read above: another writer could have
        // forfeited it for damage between the read and this update.
        .eq("status", "held");
    if (error) throw error;

    await writeAudit({
        actorId,
        targetUserId: deposit.userId,
        action: "deposit.forfeited",
        entityType: "deposit",
        entityId: deposit.id,
        after: {
            amount: deposit.amount,
            rental_days_completed: daysCompleted,
            min_rental_days_required: minRentalDays,
            reason,
        },
    });

    await notify({
        notificationType: "deposit_forfeited",
        referenceType: "deposit",
        referenceId: deposit.id,
        title: "Security deposit forfeited",
        bodyFallback:
            `Your ₹${deposit.amount} security deposit is not refundable: ${daysCompleted} of the ` +
            `${minRentalDays} rental days required were completed.`,
        riderId: deposit.userId,
    });
}
