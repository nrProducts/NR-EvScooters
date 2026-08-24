// =========================================================================
// plan-expiry-reminder  —  daily pg_cron job  →  Expo push
//
// Warns a rider two days before their rental is due back that a late fee
// starts after that. Runs once a day against a rental's fixed due date, so
// each rental matches "two days out" exactly once.
//
// Riders who have ALREADY requested a return are skipped: their deadline has
// moved and the app is already showing them the new one, so this would be a
// duplicate nag.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// `rentals.expires_at` (a timestamp) is `due_back_at`, and the return
// request is no longer a `return_requested_at` column — it is a row in
// `rental_returns`. "Has this rider asked to return?" is therefore an
// absence-of-row check, and it covers the whole workflow rather than one
// moment in it: requested, inspected and approved are all states where the
// rider is already dealing with the return.
//
// A return that was REJECTED does not count. The rider is back on the
// original deadline in that case, which is exactly when this warning matters
// most.
//
// The scooter is reached through v_rental_current_vehicle, because
// `rentals.vehicle_id` is gone — a rental can run through several scooters
// (a temp swap, a replacement), and the view resolves which one is current.
//
// The day window is anchored to business_today() rather than the Deno
// clock's local midnight, which was UTC and therefore 5½ hours adrift.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";
import { notifyStaff } from "../_shared/notifyStaff.ts";

const SOURCE = "plan-expiry-reminder";

/**
 * Mirrors LATE_RETURN_FEE_PER_DAY in
 * apps/backend/src/modules/rentals/returnPolicy.constants.ts. Duplicated
 * because Deno cannot import the backend's modules — keep the two in step.
 */
const LATE_RETURN_FEE_PER_DAY = 100;

/** How far ahead of the due date to warn. */
const WARN_DAYS_BEFORE = 2;

interface RentalRow {
    id: string;
    user_id: string;
    due_back_at: string;
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    let target: string;
    try {
        target = addDays(await businessToday(admin), WARN_DAYS_BEFORE);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    // due_back_at is a timestamp, so the target DAY is a half-open range.
    const { data: rentals, error } = await admin
        .from("rentals")
        .select("id, user_id, due_back_at")
        .eq("status", "active")
        .gte("due_back_at", `${target}T00:00:00Z`)
        .lt("due_back_at", `${addDays(target, 1)}T00:00:00Z`);

    if (error) {
        console.error(`[${SOURCE}] failed to query rentals`, error);
        return json({ error: "Query failed." }, 500);
    }

    let logged = 0;
    let sent = 0;
    let skippedReturning = 0;

    for (const row of (rentals ?? []) as RentalRow[]) {
        if (await hasOpenReturn(admin, row.id)) {
            skippedReturning++;
            continue;
        }

        const vehicleName = await currentVehicleName(admin, row.id);

        const result = await notifyUser(admin, row.user_id, {
            typeCode: "plan_expiring",
            subjectType: "rental",
            subjectId: row.id,
            title: "Your Plan Ends Soon",
            body: `Your plan for ${vehicleName ?? "your scooter"} ends in ${WARN_DAYS_BEFORE} days. `
                + `Return it by then or a ₹${LATE_RETURN_FEE_PER_DAY}/day late fee applies.`,
            screen: "home",
            payload: { due_back_at: row.due_back_at },
        });
        if (result.logged) logged++;
        if (result.sent) sent++;

        await notifyStaff(admin, {
            typeCode: "plan_expiring",
            subjectType: "rental",
            subjectId: row.id,
            title: "Plan Ending Soon",
            body: `${vehicleName ?? "A scooter"}'s plan ends in ${WARN_DAYS_BEFORE} days.`,
            screen: "/bookings",
            payload: { due_back_at: row.due_back_at, rider_id: row.user_id },
        });
    }

    return json({ rentals: rentals?.length ?? 0, logged, sent, skippedReturning }, 200);
});

/** A return already in flight — requested, inspected or approved, but not rejected. */
async function hasOpenReturn(admin: Admin, rentalId: string): Promise<boolean> {
    const { data, error } = await admin
        .from("rental_returns")
        .select("id")
        .eq("rental_id", rentalId)
        .in("status", ["requested", "inspected", "approved"])
        .limit(1);
    if (error) {
        console.error(`[${SOURCE}] return lookup failed`, { rentalId, error: error.message });
        // Err towards silence: a duplicate nag is worse than a missed one.
        return true;
    }
    return (data ?? []).length > 0;
}

async function currentVehicleName(admin: Admin, rentalId: string): Promise<string | null> {
    const { data: current } = await admin
        .from("v_rental_current_vehicle")
        .select("vehicle_id")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (!current?.vehicle_id) return null;

    const { data: vehicle } = await admin
        .from("vehicles")
        .select("display_name, vehicle_models(name)")
        .eq("id", current.vehicle_id)
        .maybeSingle();
    if (!vehicle) return null;

    const raw = (vehicle as { vehicle_models: unknown }).vehicle_models;
    const model = (Array.isArray(raw) ? raw[0] : raw) as { name: string } | null;
    return (vehicle as { display_name: string | null }).display_name ?? model?.name ?? null;
}
