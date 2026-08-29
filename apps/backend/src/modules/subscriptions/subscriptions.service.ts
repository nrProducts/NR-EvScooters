import { supabaseAdmin } from "../../config/supabase";
import { writeAudit } from "../../common/audit";
import { addDays, wholeDaysBetween } from "../../common/dates";
import { notifyUser } from "../notifications/notifications.service";
import { lateFeeOverrideCode } from "../payments/renewalFee";
import { AuthContext } from "../../types";

/**
 * The subscription — the agreement between a rider and a plan.
 *
 * Twelve columns on `bookings` used to carry this: `plan_id`, `plan_status`,
 * `plan_activated_at`, `next_due_at`, `plan_paused_at`,
 * `plan_paused_days_total`, `renewal_status`, `scheduled_start_date` and the
 * rest. A booking is a reservation; it had no business also being the
 * agreement, the billing clock and the pause ledger. Those are now
 * `subscriptions`, `subscription_periods` and `subscription_pauses`.
 *
 * This file currently owns pause and resume, moved wholesale out of
 * plans.service.ts because maintenance and rentals need them. Period
 * generation, renewal and cancellation land here in Stage 4.
 *
 * One state renamed on the way across: `plan_status = 'due'` is
 * `subscriptions.status = 'past_due'`. Same meaning, and the sweep that sets
 * it is unchanged.
 */

// `maintenance_resolved` covers a ticket that only ever paused the rider's
// plan (no vehicle was ever swapped, so there is nothing to hand back) —
// resolving the ticket is the only signal that the pause should end.
export type PauseResumeReason = "temp_vehicle" | "original_handback" | "replacement" | "maintenance_resolved";

export interface ResumeComputation {
    daysPaused: number;
    restoredStatus: "active" | "past_due";
    /** The current period's new `ends_on`, shifted by the paused days. */
    newEndsOn: string;
    /** The current period's new `due_on`, shifted by the same. */
    newDueOn: string;
}

/**
 * Pure day-shift math, exported for the same reason
 * computeCancellationCharge/computeLateReturnPenalty are: the tests exercise
 * this exact rule and must not need a database.
 *
 * `pausedAt`/`resumedAt` decide BOTH how many days to give back AND whether
 * the restored status is `active` or `past_due` — and the latter is decided
 * by whether the period was already overdue at the moment the pause began,
 * not by where "now" happens to fall. A rider whose scooter broke down while
 * they were already late does not get made current by the breakdown.
 */
export function computePlanResume(input: {
    /** The current period's `ends_on`. */
    endsOn: string;
    /** The current period's `due_on`. Defaults to `endsOn` — they usually match. */
    dueOn?: string;
    pausedAt: Date;
    resumedAt?: Date;
}): ResumeComputation {
    const resumedAt = input.resumedAt ?? new Date();
    const dueOn = input.dueOn ?? input.endsOn;
    const daysPaused = Math.max(0, wholeDaysBetween(input.pausedAt, resumedAt));
    const wasDueAtPauseTime = new Date(`${dueOn}T00:00:00Z`) <= input.pausedAt;

    return {
        daysPaused,
        restoredStatus: wasDueAtPauseTime ? "past_due" : "active",
        newEndsOn: addDays(input.endsOn, daysPaused),
        newDueOn: addDays(dueOn, daysPaused),
    };
}

/** The subscription whose rider currently holds this vehicle, if any. */
export async function subscriptionForVehicle(vehicleId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("subscription_id")
        .eq("vehicle_id", vehicleId)
        .maybeSingle();
    if (error) throw error;
    return data?.subscription_id ?? null;
}

/** The `current` period of a subscription, or null when it has none. */
async function currentPeriod(subscriptionId: string) {
    const { data, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, sequence_number, starts_on, ends_on, due_on")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * Freezes billing while the rider has no working scooter.
 *
 * Called when the vehicle attached to a subscription enters maintenance (see
 * rentals.service.ts's moveRideToMaintenance). The period dates are left
 * exactly where they are; {@link resumeSubscription} shifts them forward by
 * the elapsed pause, never re-anchoring to "now".
 *
 * A no-op for a vehicle nobody is subscribed to (a spare or demo unit) and for
 * a subscription that is not currently active.
 */
export async function pauseSubscription(
    subscriptionId: string,
    maintenanceTicketId: string,
    actor: AuthContext | null,
): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, status")
        .eq("id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription || subscription.status === "paused") return;

    const now = new Date().toISOString();

    // The status guard is in the WHERE clause, not an if: two concurrent
    // breakdown reports must not both open a pause row.
    const { data: updated, error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: "paused" })
        .eq("id", subscriptionId)
        .in("status", ["active", "past_due"])
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // Already paused by a concurrent call — idempotent.

    const { error: pauseError } = await supabaseAdmin.from("subscription_pauses").insert({
        subscription_id: subscriptionId,
        maintenance_ticket_id: maintenanceTicketId,
        reason: "vehicle_breakdown",
        paused_at: now,
    });
    if (pauseError) throw pauseError;

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: subscription.user_id, action: "plan.paused",
        entityType: "subscription", entityId: subscriptionId, after: { status: "paused" },
    });

    await notifyUser(subscription.user_id, {
        template: "maintenance_plan_paused",
        title: "Rental Plan Paused",
        body: "Your vehicle is currently under maintenance. Your rental plan has been paused.",
        screen: "my-plan",
    });
}

/**
 * The one shared resume path, called from the three "rider is riding again"
 * hooks: assignTempVehicle, the handback branch of updateMaintenanceTicket,
 * and reassignAfterScrap. Never creates a new subscription and never charges
 * again — it restores the same one and gives back the lost days.
 */
export async function resumeSubscription(
    subscriptionId: string,
    maintenanceTicketId: string,
    resumedVia: PauseResumeReason,
    actor: AuthContext,
): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, status")
        .eq("id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription || subscription.status !== "paused") return;

    const { data: openPause, error: pauseFetchError } = await supabaseAdmin
        .from("subscription_pauses")
        .select("id, paused_at")
        .eq("subscription_id", subscriptionId)
        .is("resumed_at", null)
        .order("paused_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (pauseFetchError) throw pauseFetchError;

    const period = await currentPeriod(subscriptionId);
    if (!openPause || !period) {
        // Paused with no open pause row or no current period is a state this
        // code cannot repair, and guessing dates would silently overcharge or
        // undercharge the rider. Leave it paused for a human to look at.
        console.error("[subscriptions] cannot resume: incomplete pause state", {
            subscriptionId, hasPause: !!openPause, hasPeriod: !!period,
        });
        return;
    }

    const pausedAt = new Date(openPause.paused_at);
    const resumedAt = new Date();
    const { daysPaused, restoredStatus, newEndsOn, newDueOn } = computePlanResume({
        endsOn: period.ends_on, dueOn: period.due_on, pausedAt, resumedAt,
    });

    const { data: updated, error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: restoredStatus })
        .eq("id", subscriptionId)
        .eq("status", "paused")
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // Already resumed by a concurrent call — idempotent.

    const { error: periodError } = await supabaseAdmin
        .from("subscription_periods")
        .update({ ends_on: newEndsOn, due_on: newDueOn })
        .eq("id", period.id);
    if (periodError) throw periodError;

    const { error: closePauseError } = await supabaseAdmin
        .from("subscription_pauses")
        .update({ resumed_at: resumedAt.toISOString(), days_paused: daysPaused })
        .eq("id", openPause.id);
    if (closePauseError) throw closePauseError;

    // A `scheduled` next period was anchored on the old period end, so it has
    // to move by the same number of days or the renewal fires early and
    // overlaps the period still running.
    if (daysPaused > 0) {
        const { data: scheduled, error: scheduledError } = await supabaseAdmin
            .from("subscription_periods")
            .select("id, starts_on, ends_on, due_on")
            .eq("subscription_id", subscriptionId)
            .eq("status", "scheduled");
        if (scheduledError) throw scheduledError;

        for (const next of scheduled ?? []) {
            const { error: shiftError } = await supabaseAdmin
                .from("subscription_periods")
                .update({
                    starts_on: addDays(next.starts_on, daysPaused),
                    ends_on: addDays(next.ends_on, daysPaused),
                    due_on: addDays(next.due_on, daysPaused),
                })
                .eq("id", next.id);
            if (shiftError) throw shiftError;
        }
    }

    await writeAudit({
        actorId: actor.id, targetUserId: subscription.user_id, action: "plan.resumed",
        entityType: "subscription", entityId: subscriptionId,
        after: {
            status: restoredStatus,
            ends_on: newEndsOn,
            due_on: newDueOn,
            days_paused: daysPaused,
            resumed_via: resumedVia,
            maintenance_ticket_id: maintenanceTicketId,
        },
    });

    await notifyUser(subscription.user_id, {
        template: "vehicle_available_again",
        title: "Vehicle Available Again",
        body: "Your vehicle has been assigned back to you and your rental plan has resumed.",
        screen: "my-plan",
    });
}

/**
 * Ends the subscription behind a booking that has just been cancelled.
 *
 * A booking cancellation used to leave the subscription untouched, so a
 * rider who cancelled a paid booking still showed a `plan_status = 'active'`
 * plan fleet-wide (see the SwapNgo bug-fix backlog, item 4). This closes it:
 * any non-terminal subscription for the booking (`pending_payment`, `active`,
 * `past_due`, `paused`) moves to `cancelled` with `ended_at` stamped.
 *
 * Idempotent and safe to call unconditionally — a no-op when there is no
 * subscription, or it is already `ended`/`cancelled`. Deliberately does NOT
 * touch `subscription_periods`: that mirrors the normal end-of-rental path
 * (completeRide in rentals.service.ts), and the billing sweeps already skip
 * `ended`/`cancelled` subscriptions.
 */
export async function cancelSubscriptionForBooking(
    bookingId: string,
    reason: string | null,
    actor: AuthContext | null,
): Promise<void> {
    const { data: subscription, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id, user_id, status")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!subscription) return;
    if (subscription.status === "ended" || subscription.status === "cancelled") return;

    const endedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({ status: "cancelled", ended_at: endedAt })
        .eq("id", subscription.id)
        .in("status", ["pending_payment", "active", "past_due", "paused"])
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // Raced to a terminal state by a concurrent call — idempotent.

    await writeAudit({
        actorId: actor?.id ?? null,
        targetUserId: subscription.user_id,
        action: "plan.updated",
        entityType: "subscription",
        entityId: subscription.id,
        before: { status: subscription.status },
        after: { status: "cancelled", ended_at: endedAt, reason: reason ?? "booking cancelled" },
    });
}

/**
 * Sets (or clears) a per-subscription late-fee rate.
 *
 * The successor to `bookings.late_fee_override`. Rather than a nullable column
 * on the agreement, it is a `pricing_rules` row scoped to this subscription —
 * which is what the scope columns exist for, and which means an override is
 * dated, attributable and visible alongside every other charge rule instead of
 * being a number hidden on a booking.
 *
 * Passing null deactivates the rule rather than deleting it: an override that
 * was in force for three weeks is part of the record of what the rider was
 * charged, and deleting the row would erase the reason a past invoice looks
 * the way it does.
 */
export async function setLateFeeOverride(
    subscriptionId: string,
    ratePerDay: number | null,
    actor: AuthContext,
): Promise<number | null> {
    const code = lateFeeOverrideCode(subscriptionId);

    const { data: existing, error: readError } = await supabaseAdmin
        .from("pricing_rules")
        .select("id")
        .eq("code", code)
        .maybeSingle();
    if (readError) throw readError;

    if (ratePerDay === null) {
        if (existing) {
            const { error } = await supabaseAdmin
                .from("pricing_rules")
                .update({ is_active: false })
                .eq("id", existing.id);
            if (error) throw error;
        }
    } else if (existing) {
        const { error } = await supabaseAdmin
            .from("pricing_rules")
            .update({ amount: ratePerDay, is_active: true })
            .eq("id", existing.id);
        if (error) throw error;
    } else {
        const { error } = await supabaseAdmin.from("pricing_rules").insert({
            code,
            name: "Late fee (subscription override)",
            description: `Overrides the global late fee for subscription ${subscriptionId}.`,
            kind: "charge",
            scope: "subscription",
            scope_ref_id: subscriptionId,
            amount: ratePerDay,
            amount_type: "fixed",
            // Event-driven like the global rule — see the seed migration.
            frequency: "one_time",
            is_active: true,
            created_by_user_id: actor.id,
        });
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "pricing_rule.updated",
        entityType: "pricing_rule",
        entityId: subscriptionId,
        after: { late_fee_override: ratePerDay },
    });

    return ratePerDay;
}
