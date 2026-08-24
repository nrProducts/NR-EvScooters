// =========================================================================
// vehicle-recovery-sweep  —  daily pg_cron job
//
// Nothing today proactively scans for a scooter that never came back — the
// return late fee (computeLateReturnPenalty in
// apps/backend/src/modules/rentals/rentals.service.ts) is only ever computed
// on demand, at settlement. This sweep is the first thing that walks active
// rentals on a schedule: once a rental is more than
// return_recovery_settings.max_late_fee_days past its effective due date,
// it flags recovery_flagged_at (see 20260824100000_return_recovery_policy.sql
// for why that's an additive column, not a new rental_status value) and
// notifies staff.
//
// Idempotency is the guarded UPDATE itself: `.is("recovery_flagged_at",
// null)` means a row already flagged (by an earlier run, or a concurrent
// one) is excluded from the very next candidate query, so there is no
// separate "have I already notified for this one" check to get wrong.
//
// No migration-time backfill for rentals already overdue past the cap when
// this ships — if it pre-flagged them, the guarded update above would then
// skip them forever, meaning the rentals that most need staff attention
// would be the ones nobody gets told about. The sweep's query is a pure
// function of *current* state, so its very first run after deploy discovers
// and flags every already-overdue rental and fires the notification for
// each — that first run IS the backfill.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { businessToday } from "../_shared/dates.ts";
import { notifyStaff } from "../_shared/notifyStaff.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "vehicle-recovery-sweep";

interface OpenReturn {
    due_back_at: string;
    status: string;
}

interface RentalRow {
    id: string;
    user_id: string;
    due_back_at: string;
    rental_returns: OpenReturn | OpenReturn[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/** Same rule as effectiveDueAt()/openReturn() in rentals.service.ts: an open
 * return request (requested/inspected) can only shorten the deadline, never
 * extend it — 'approved' has already led to settlement, 'rejected' reverts
 * to the rental's own due_back_at. */
function effectiveDueAt(rental: RentalRow): string {
    const ret = unwrap<OpenReturn>(rental.rental_returns);
    if (ret && (ret.status === "requested" || ret.status === "inspected")) {
        return ret.due_back_at;
    }
    return rental.due_back_at;
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    let today: string;
    try {
        today = await businessToday(admin);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    const { data: settings, error: settingsError } = await admin
        .from("return_recovery_settings")
        .select("max_late_fee_days")
        .maybeSingle();
    if (settingsError || !settings) {
        console.error(`[${SOURCE}] could not read return_recovery_settings`, settingsError);
        return json({ error: "Settings not configured." }, 500);
    }
    const maxDays = settings.max_late_fee_days as number;

    const { data: rows, error } = await admin
        .from("rentals")
        .select("id, user_id, due_back_at, rental_returns(due_back_at, status)")
        .eq("status", "active")
        .is("recovery_flagged_at", null);
    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    const todayMs = Date.parse(`${today}T00:00:00Z`);
    let flagged = 0;

    for (const rental of (rows ?? []) as unknown as RentalRow[]) {
        const dueAt = effectiveDueAt(rental);
        if (!dueAt) continue;

        const due = new Date(dueAt);
        const dueMidnightMs = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
        const daysLate = Math.round((todayMs - dueMidnightMs) / 86_400_000);
        if (daysLate <= maxDays) continue; // still within the late-fee window, not recovery yet

        const { data: updated, error: updateError } = await admin
            .from("rentals")
            .update({ recovery_flagged_at: new Date().toISOString() })
            .eq("id", rental.id)
            .eq("status", "active")
            .is("recovery_flagged_at", null)
            .select("id")
            .maybeSingle();
        if (updateError) {
            console.error(`[${SOURCE}] could not flag rental`, { rentalId: rental.id, error: updateError });
        }
        if (updateError || !updated) continue; // lost the race or already flagged elsewhere

        flagged++;

        await writeAudit(admin, {
            targetUserId: rental.user_id,
            action: "rental.recovery_required",
            entityType: "rental",
            entityId: rental.id,
            after: { days_late: daysLate, max_late_fee_days: maxDays, due_back_at: dueAt },
            source: SOURCE,
        });

        await notifyStaff(admin, {
            typeCode: "vehicle_recovery_required",
            subjectType: "rental",
            subjectId: rental.id,
            title: "Vehicle Recovery Required",
            body: "A rental is now past the late-fee window — go recover the scooter and contact the rider.",
            screen: "/returns?tab=recovery",
            payload: { rental_id: rental.id, rider_id: rental.user_id, days_late: daysLate },
        });
    }

    return json({ candidates: rows?.length ?? 0, flagged }, 200);
});
