// =========================================================================
// plan-expiry-reminder  —  daily pg_cron job  →  Expo push
//
// Finds active rentals whose plan expires in 2 days and warns the rider that
// a late fee starts after that. Runs once/day against a rental's fixed
// expires_at, so a given rental only ever matches "2 days out" exactly once —
// no separate already-reminded tracking needed, same argument as
// pickup-reminder.
//
// Riders who have ALREADY requested a return are skipped: their deadline has
// moved to return_due_at and ReturnStatusCard is already telling them about
// it, so this would be a duplicate nag.
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

/**
 * Mirrors LATE_RETURN_FEE_PER_DAY in
 * apps/backend/src/modules/rentals/returnPolicy.constants.ts. Duplicated for
 * the same reason as the notifyUser logic above — keep the two in step.
 */
const LATE_RETURN_FEE_PER_DAY = 100;

/** How far ahead of expiry to warn. */
const WARN_DAYS_BEFORE = 2;

interface RentalRow {
    id: string;
    user_id: string;
    expires_at: string;
    vehicles: { name: string } | { name: string }[] | null;
    users: { push_token: string | null } | { push_token: string | null }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/** [start, end) covering the whole calendar day WARN_DAYS_BEFORE days out. */
function targetDayRange(): { start: string; end: string } {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + WARN_DAYS_BEFORE);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
        return json({ error: "Function not configured." }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { start, end } = targetDayRange();
    const { data: rentals, error } = await admin
        .from("rentals")
        .select("id, user_id, expires_at, vehicles(name), users(push_token)")
        .eq("status", "active")
        .is("return_requested_at", null)
        .gte("expires_at", start)
        .lt("expires_at", end);

    if (error) {
        console.error("[plan-expiry-reminder] failed to query rentals", error);
        return json({ error: "Query failed." }, 500);
    }

    let sent = 0;
    let logged = 0;

    for (const row of (rentals ?? []) as unknown as RentalRow[]) {
        const vehicle = unwrap<{ name: string }>(row.vehicles);
        const user = unwrap<{ push_token: string | null }>(row.users);

        const title = "Your Plan Ends Soon";
        const body = `Your plan for ${vehicle?.name ?? "your scooter"} ends in ${WARN_DAYS_BEFORE} days. `
            + `Return it by then or a ₹${LATE_RETURN_FEE_PER_DAY}/day late fee applies.`;

        const { data: inserted, error: insertError } = await admin
            .from("notifications_log")
            .insert({
                user_id: row.user_id,
                channel: "push",
                template: "plan_expiry_reminder",
                payload: { title, body, screen: "home" },
                status: "pending",
            })
            .select("id")
            .single();

        if (insertError || !inserted) {
            console.error("[plan-expiry-reminder] failed to log notification", { rentalId: row.id, error: insertError });
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
            console.error("[plan-expiry-reminder] push send threw", { rentalId: row.id, err });
            await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
        }
    }

    return json({ rentals: rentals?.length ?? 0, logged, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}
