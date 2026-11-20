import { supabaseAdmin } from "../../config/supabase";
import { businessRule } from "../../common/AppError";
import {
    businessToday, calculateRentalPeriod, cycleBoundaryAt, istClockTime, normalizeCycleTime,
} from "../../common/dates";

export interface CycleAnchor {
    /** When the rental starts — the pickup instant on a first pickup. */
    startAt: string;
    /** When the current period ends — the rental's due-back instant. */
    endAt: string;
    /** `YYYY-MM-DD` the current period ends on. */
    endDate: string;
    /** The subscription's cycle time, `HH:MM:SS`. */
    cycleTime: string;
}

/**
 * Starts a subscription's clock at the pickup instant.
 *
 * On the subscription's FIRST hand-over (no rental has ever been opened
 * against it, and it is still in period #1) this sets
 * `subscriptions.cycle_time` to the pickup's IST clock time, to the minute,
 * and re-dates period #1 to begin on the pickup day, keeping its length:
 * picked up 3:47 PM on the 17th on a 1-day plan → due back 3:47 PM on the
 * 18th. Every renewal starts on the previous period's end date at this same
 * cycle time, so it continues from exactly when the previous period ended.
 *
 * Any later hand-over (a vehicle swap, a re-issue) leaves the running clock
 * alone: the new rental starts now and is due when the current period ends.
 *
 * Call it before inserting the new rental — the "no rental yet" check reads
 * the rentals table.
 *
 * `billingTime` (`HH:MM:SS`, IST) lets staff choose a different billing time
 * at pickup — a rider who can't pay at the hour they happen to collect the
 * scooter. Only the billing clock changes: the rental still starts NOW
 * (`startAt` is the real handover instant), period #1 still begins on the
 * pickup day, and it ends on its usual day at the chosen time — earlier or
 * later than the pickup time, as chosen. It only applies to a first pickup;
 * a swap or re-issue never moves a running clock, so it is refused there.
 */
export async function anchorCycleAtPickup(
    subscriptionId: string,
    now: Date = new Date(),
    billingTime?: string | null,
): Promise<CycleAnchor> {
    const [subRes, periodRes, rentalsRes] = await Promise.all([
        supabaseAdmin.from("subscriptions").select("cycle_time").eq("id", subscriptionId).single(),
        supabaseAdmin
            .from("subscription_periods")
            .select("id, sequence_number, starts_on, ends_on")
            .eq("subscription_id", subscriptionId)
            .eq("status", "current")
            .maybeSingle(),
        supabaseAdmin
            .from("rentals")
            .select("id", { count: "exact", head: true })
            .eq("subscription_id", subscriptionId),
    ]);
    if (subRes.error) throw subRes.error;
    if (periodRes.error) throw periodRes.error;
    if (rentalsRes.error) throw rentalsRes.error;

    const period = periodRes.data;
    if (!period) throw businessRule("This subscription has no current billing period to rent against.");

    const firstPickup = period.sequence_number === 1 && (rentalsRes.count ?? 0) === 0;
    if (!firstPickup) {
        if (billingTime) {
            throw businessRule(
                "A billing time can only be chosen on the rider's first pickup. Use \"Change billing cycle\" instead.",
            );
        }
        const cycleTime = normalizeCycleTime(subRes.data.cycle_time);
        return {
            startAt: now.toISOString(),
            endAt: cycleBoundaryAt(period.ends_on, cycleTime),
            endDate: period.ends_on,
            cycleTime,
        };
    }

    const cycleTime = billingTime ? normalizeCycleTime(billingTime) : istClockTime(now);
    const lengthDays = Math.round(
        (Date.parse(`${period.ends_on}T00:00:00Z`) - Date.parse(`${period.starts_on}T00:00:00Z`)) / 86_400_000,
    );
    const next = calculateRentalPeriod(businessToday(now), lengthDays, cycleTime);

    const { error: subError } = await supabaseAdmin
        .from("subscriptions")
        .update({ cycle_time: cycleTime })
        .eq("id", subscriptionId);
    if (subError) throw subError;

    const { error: periodError } = await supabaseAdmin
        .from("subscription_periods")
        .update({ starts_on: next.startDate, ends_on: next.endDate, due_on: next.endDate })
        .eq("id", period.id)
        .eq("status", "current");
    if (periodError) throw periodError;

    // With no chosen time, next.startAt IS the pickup minute. With one, it
    // would be the pickup DAY at the chosen time — possibly hours away from
    // (even after) the real handover, so the rental starts at `now` instead.
    const startAt = billingTime ? now.toISOString() : next.startAt;
    return { startAt, endAt: next.endAt, endDate: next.endDate, cycleTime };
}
