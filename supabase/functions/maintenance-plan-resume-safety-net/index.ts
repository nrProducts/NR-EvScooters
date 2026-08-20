// =========================================================================
// maintenance-plan-resume-safety-net  —  daily pg_cron job
//
// Resume is normally event-driven: assignTempVehicle, the handback branch of
// updateMaintenanceTicket, and reassignAfterScrap each call
// resumeSubscription the moment the rider is riding again. This is the
// backstop for when that path did not fire — a bug, a request that crashed
// mid-flight — and finds a subscription stuck `paused` whose maintenance
// ticket has already closed.
//
// The day-shift math is exactly computePlanResume() in
// apps/backend/src/modules/subscriptions/subscriptions.service.ts,
// re-implemented because Deno cannot import the backend's modules. Keep the
// two in step: they decide what a rider is charged.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// The pause is a property of the SUBSCRIPTION. `bookings.plan_status` is
// `subscriptions.status`, `plan_pause_events` is `subscription_pauses`, and
// `vehicle_maintenance` is `maintenance_tickets`.
//
// Giving the days back is the bigger change. There is no `next_due_at` to
// add days to — the period rows carry the dates, so resuming extends the
// CURRENT period's `ends_on` and `due_on`, and shifts every `scheduled`
// period by the same number of days. Skipping that second part would leave a
// renewal anchored on the old period end, firing early and overlapping the
// period still running.
//
// One thing this deliberately does NOT do is touch vehicle assignment. Which
// scooter the rider is now on is exactly the fact the missed event would
// have supplied; this only unsticks the billing clock.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { addDays } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "maintenance-plan-resume-safety-net";

interface PausedSubscriptionRow {
    id: string;
    user_id: string;
}

interface OpenPauseRow {
    id: string;
    paused_at: string;
    maintenance_ticket_id: string | null;
}

interface PeriodRow {
    id: string;
    ends_on: string;
    due_on: string;
}

/** Whole days between two instants, UTC-midnight to UTC-midnight. */
function wholeDaysBetween(earlier: Date, later: Date): number {
    const a = Date.UTC(earlier.getUTCFullYear(), earlier.getUTCMonth(), earlier.getUTCDate());
    const b = Date.UTC(later.getUTCFullYear(), later.getUTCMonth(), later.getUTCDate());
    return Math.round((b - a) / 86_400_000);
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    const { data: paused, error } = await admin
        .from("subscriptions")
        .select("id, user_id")
        .eq("status", "paused");

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    let checked = 0;
    let resumed = 0;

    for (const subscription of (paused ?? []) as PausedSubscriptionRow[]) {
        checked++;

        const { data: openPause } = await admin
            .from("subscription_pauses")
            .select("id, paused_at, maintenance_ticket_id")
            .eq("subscription_id", subscription.id)
            .is("resumed_at", null)
            .order("paused_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        const pause = openPause as OpenPauseRow | null;
        if (!pause?.maintenance_ticket_id) continue;

        const { data: ticket } = await admin
            .from("maintenance_tickets")
            .select("status")
            .eq("id", pause.maintenance_ticket_id)
            .maybeSingle();
        // Ticket still open — genuinely still paused, nothing to fix.
        if (!ticket || (ticket.status !== "resolved" && ticket.status !== "cancelled")) continue;

        const { data: currentPeriod } = await admin
            .from("subscription_periods")
            .select("id, ends_on, due_on")
            .eq("subscription_id", subscription.id)
            .eq("status", "current")
            .maybeSingle();
        const period = currentPeriod as PeriodRow | null;
        if (!period) {
            // Paused with no current period is a state this cannot repair,
            // and guessing dates would silently over- or under-charge the
            // rider. Leave it for a human.
            console.error(`[${SOURCE}] cannot resume: no current period`, {
                subscriptionId: subscription.id,
            });
            continue;
        }

        const pausedAt = new Date(pause.paused_at);
        const resumedAt = new Date();
        const daysPaused = Math.max(0, wholeDaysBetween(pausedAt, resumedAt));
        // Decided by where the period stood WHEN THE PAUSE BEGAN: a rider
        // whose scooter broke down while they were already late is not made
        // current by the breakdown.
        const wasDueAtPauseTime = new Date(`${period.due_on}T00:00:00Z`) <= pausedAt;
        const restoredStatus = wasDueAtPauseTime ? "past_due" : "active";
        const newEndsOn = addDays(period.ends_on, daysPaused);
        const newDueOn = addDays(period.due_on, daysPaused);

        const { data: updated, error: updateError } = await admin
            .from("subscriptions")
            .update({ status: restoredStatus })
            .eq("id", subscription.id)
            .eq("status", "paused")
            .select("id")
            .maybeSingle();
        if (updateError) {
            console.error(`[${SOURCE}] update failed`, {
                subscriptionId: subscription.id,
                error: updateError,
            });
            continue;
        }
        if (!updated) continue; // Resumed concurrently by the real path.
        resumed++;

        await admin
            .from("subscription_periods")
            .update({ ends_on: newEndsOn, due_on: newDueOn })
            .eq("id", period.id);

        await admin
            .from("subscription_pauses")
            .update({ resumed_at: resumedAt.toISOString(), days_paused: daysPaused })
            .eq("id", pause.id);

        if (daysPaused > 0) await shiftScheduledPeriods(admin, subscription.id, daysPaused);

        await writeAudit(admin, {
            targetUserId: subscription.user_id,
            action: "plan.resumed",
            entityType: "subscription",
            entityId: subscription.id,
            after: {
                status: restoredStatus,
                ends_on: newEndsOn,
                due_on: newDueOn,
                days_paused: daysPaused,
                maintenance_ticket_id: pause.maintenance_ticket_id,
                safety_net: true,
            },
            source: SOURCE,
        });

        await notifyUser(admin, subscription.user_id, {
            typeCode: "plan_resumed",
            subjectType: "subscription",
            subjectId: subscription.id,
            title: "Vehicle Available Again",
            body: "Your vehicle has been assigned back to you and your rental plan has resumed.",
            screen: "my-plan",
        });
    }

    return json({ checked, resumed }, 200);
});

/** Every future period moves by the same days, or the renewal fires early. */
async function shiftScheduledPeriods(
    admin: Admin,
    subscriptionId: string,
    daysPaused: number,
): Promise<void> {
    const { data: scheduled, error } = await admin
        .from("subscription_periods")
        .select("id, starts_on, ends_on, due_on")
        .eq("subscription_id", subscriptionId)
        .eq("status", "scheduled");
    if (error) {
        console.error(`[${SOURCE}] could not read scheduled periods`, {
            subscriptionId,
            error: error.message,
        });
        return;
    }

    for (const next of (scheduled ?? []) as Array<{
        id: string;
        starts_on: string;
        ends_on: string;
        due_on: string;
    }>) {
        await admin
            .from("subscription_periods")
            .update({
                starts_on: addDays(next.starts_on, daysPaused),
                ends_on: addDays(next.ends_on, daysPaused),
                due_on: addDays(next.due_on, daysPaused),
            })
            .eq("id", next.id);
    }
}
