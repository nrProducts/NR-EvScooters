// =========================================================================
// pickup-reminder  —  daily pg_cron job  →  Expo push
//
// Finds bookings with status='confirmed' whose start_day is tomorrow and
// sends a reminder push. Runs once/day, so a given booking's fixed
// start_day only ever matches "tomorrow" exactly once — no separate
// already-reminded tracking needed.
//
// Mirrors the "log first, best-effort send" contract of
// apps/backend/src/modules/notifications/notifications.service.ts's
// notifyUser(), re-implemented here in Deno because this function can't
// import the backend's TS modules — same reason send-sms re-implements
// apps/backend/src/modules/auth/msg91.ts's logic instead of importing it.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface BookingRow {
    id: string;
    user_id: string;
    start_day: string;
    vehicle_models: { name: string } | { name: string }[] | null;
    stations: { name: string } | { name: string }[] | null;
    users: { push_token: string | null } | { push_token: string | null }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function tomorrowIso(): string {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return json({ error: "Function not configured." }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: bookings, error } = await admin
        .from("bookings")
        .select("id, user_id, start_day, vehicle_models(name), stations(name), users(push_token)")
        .eq("status", "confirmed")
        .eq("start_day", tomorrowIso());

    if (error) {
        console.error("[pickup-reminder] failed to query bookings", error);
        return json({ error: "Query failed." }, 500);
    }

    let sent = 0;
    let logged = 0;

    for (const row of (bookings ?? []) as unknown as BookingRow[]) {
        const model = unwrap<{ name: string }>(row.vehicle_models);
        const station = unwrap<{ name: string }>(row.stations);
        const user = unwrap<{ push_token: string | null }>(row.users);

        const title = "Pickup Tomorrow";
        const body = `Your ${model?.name ?? "scooter"} is ready for pickup tomorrow at ${station?.name ?? "your station"}.`;

        const { data: inserted, error: insertError } = await admin
            .from("notifications_log")
            .insert({
                user_id: row.user_id,
                channel: "push",
                template: "pickup_reminder",
                payload: { title, body, screen: "home" },
                status: "pending",
            })
            .select("id")
            .single();

        if (insertError || !inserted) {
            console.error("[pickup-reminder] failed to log notification", { bookingId: row.id, error: insertError });
            continue;
        }
        logged++;

        if (!user?.push_token) continue;

        try {
            const res = await fetch(EXPO_PUSH_URL, {
                method: "POST",
                headers: { "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({ to: user.push_token, title, body, sound: "default", data: { screen: "home" } }),
            });
            const result = await res.json().catch(() => null);
            const ok = res.ok && result?.data?.status !== "error";

            await admin
                .from("notifications_log")
                .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
                .eq("id", inserted.id);

            if (ok) sent++;
        } catch (err) {
            console.error("[pickup-reminder] push send threw", { bookingId: row.id, err });
            await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
        }
    }

    return json({ bookings: bookings?.length ?? 0, logged, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
