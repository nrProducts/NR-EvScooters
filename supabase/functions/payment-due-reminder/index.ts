// =========================================================================
// payment-due-reminder  —  daily pg_cron job  →  Expo push
//
// Reminds a rider whose plan is 'active' that their weekly payment is
// coming up: 3 days before, 1 day before, and on the due date itself
// (configurable via PAYMENT_DUE_REMINDER_DAYS). Runs once/day, so a given
// booking's fixed next_due_at only ever matches each offset exactly once —
// same reasoning pickup-reminder relies on for not needing a separate
// already-reminded tracking column.
//
// Mirrors the "log first, best-effort send" contract of
// apps/backend/src/modules/notifications/notifications.service.ts's
// notifyUser(), re-implemented here in Deno because this function can't
// import the backend's TS modules.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Days-before-due to remind at. 0 = due today. */
const REMINDER_DAYS: number[] = (Deno.env.get("PAYMENT_DUE_REMINDER_DAYS") ?? "3,1,0")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);

interface BookingRow {
    id: string;
    user_id: string;
    next_due_at: string;
    plans: { name: string; price: number } | { name: string; price: number }[] | null;
    users: { push_token: string | null } | { push_token: string | null }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function dateOffsetIso(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
}

function messageFor(daysUntilDue: number, price: number): { title: string; body: string } {
    if (daysUntilDue === 0) {
        return { title: "Payment Due Today", body: `Your weekly rental payment of ₹${price} is due today.` };
    }
    return {
        title: "Payment Due Soon",
        body: `Your weekly rental payment of ₹${price} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`,
    };
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    let logged = 0;
    let sent = 0;
    let matched = 0;

    for (const offsetDays of REMINDER_DAYS) {
        const { data: bookings, error } = await admin
            .from("bookings")
            // users aliased + fkey-qualified: bookings has two fkeys to users
            // (user_id and cancelled_by), so the plain embed is ambiguous.
            .select("id, user_id, next_due_at, plans(name, price), users:users!bookings_user_id_fkey(push_token)")
            .eq("plan_status", "active")
            .eq("next_due_at", dateOffsetIso(offsetDays));

        if (error) {
            console.error("[payment-due-reminder] query failed", { offsetDays, error });
            continue;
        }

        for (const row of (bookings ?? []) as unknown as BookingRow[]) {
            matched++;
            const plan = unwrap<{ name: string; price: number }>(row.plans);
            const user = unwrap<{ push_token: string | null }>(row.users);
            const { title, body } = messageFor(offsetDays, plan?.price ?? 0);

            const { data: inserted, error: insertError } = await admin
                .from("notifications_log")
                .insert({
                    user_id: row.user_id, channel: "push", template: "payment_due_reminder",
                    payload: { title, body, screen: "billing" }, status: "pending",
                })
                .select("id")
                .single();

            if (insertError || !inserted) {
                console.error("[payment-due-reminder] failed to log", { bookingId: row.id, error: insertError });
                continue;
            }
            logged++;
            if (!user?.push_token) continue;

            try {
                const res = await fetch(EXPO_PUSH_URL, {
                    method: "POST",
                    headers: { "content-type": "application/json", accept: "application/json" },
                    body: JSON.stringify({ to: user.push_token, title, body, sound: "default", data: { screen: "billing" } }),
                });
                const result = await res.json().catch(() => null);
                const ok = res.ok && result?.data?.status !== "error";
                await admin
                    .from("notifications_log")
                    .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
                    .eq("id", inserted.id);
                if (ok) sent++;
            } catch (err) {
                console.error("[payment-due-reminder] push send threw", { bookingId: row.id, err });
                await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
            }
        }
    }

    return json({ matched, logged, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
