// =========================================================================
// pickup-reminder  —  daily pg_cron job  →  Expo push
//
// Finds confirmed bookings starting tomorrow and reminds the rider. Runs
// once a day against a booking's fixed start date, so a given booking
// matches "tomorrow" exactly once — no already-reminded tracking needed.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// `bookings.start_day` is `requested_start_on`, and the pickup location is a
// HUB rather than a station. The scooter model is reached through the plan
// (`plans.vehicle_model_id`) instead of hanging off the booking directly —
// a booking reserves a plan, and the plan is what names a model.
//
// The FK hint on the rider embed is gone with the column that made it
// necessary: `cancelled_by` moved to `booking_cancellations`, so `bookings`
// has one foreign key to `users` again and the embed is unambiguous. It is
// not needed at all here any more — the push token lives in `user_devices`,
// which _shared/notify.ts reads for itself.
//
// "Tomorrow" is business_today() + 1, not the Deno process clock + 1: the
// UTC clock rolls over at 05:30 IST, which put a whole evening's worth of
// bookings one day out.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";

const SOURCE = "pickup-reminder";

interface BookingRow {
    id: string;
    user_id: string;
    requested_start_on: string;
    plans: { name: string; vehicle_models: { name: string } | { name: string }[] | null }
        | Array<{ name: string; vehicle_models: { name: string } | { name: string }[] | null }>
        | null;
    hubs: { name: string } | { name: string }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    let tomorrow: string;
    try {
        tomorrow = addDays(await businessToday(admin), 1);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    const { data: bookings, error } = await admin
        .from("bookings")
        .select("id, user_id, requested_start_on, plans(name, vehicle_models(name)), hubs(name)")
        .eq("status", "confirmed")
        .eq("requested_start_on", tomorrow);

    if (error) {
        console.error(`[${SOURCE}] failed to query bookings`, error);
        return json({ error: "Query failed." }, 500);
    }

    let logged = 0;
    let sent = 0;

    for (const row of (bookings ?? []) as unknown as BookingRow[]) {
        const plan = unwrap<{ name: string; vehicle_models: unknown }>(row.plans);
        const model = unwrap<{ name: string }>(plan?.vehicle_models);
        const hub = unwrap<{ name: string }>(row.hubs);

        const result = await notifyUser(admin, row.user_id, {
            typeCode: "pickup_reminder",
            subjectType: "booking",
            subjectId: row.id,
            title: "Pickup Tomorrow",
            body: `Your ${model?.name ?? "scooter"} is ready for pickup tomorrow at ${hub?.name ?? "your hub"}.`,
            screen: "home",
        });
        if (result.logged) logged++;
        if (result.sent) sent++;
    }

    return json({ bookings: bookings?.length ?? 0, logged, sent }, 200);
});
