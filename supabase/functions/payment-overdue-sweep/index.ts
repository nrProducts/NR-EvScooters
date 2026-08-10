// =========================================================================
// payment-overdue-sweep  —  daily pg_cron job
//
// A booking's plan_status flips 'active' -> 'due' the day its next_due_at
// passes unpaid. This is the one place that happens — nothing else in the
// app writes plan_status='due'. Also writes an audit_logs row directly
// (can't import common/audit.ts's writeAudit from Deno) and notifies the
// rider, following the same "log first, best-effort push" contract as the
// backend's notifyUser().
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface BookingRow {
    id: string;
    user_id: string;
    users: { push_token: string | null } | { push_token: string | null }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: overdue, error } = await admin
        .from("bookings")
        .select("id, user_id, users(push_token)")
        .eq("plan_status", "active")
        .lt("next_due_at", todayIso());

    if (error) {
        console.error("[payment-overdue-sweep] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let flipped = 0;
    let sent = 0;

    for (const row of (overdue ?? []) as unknown as BookingRow[]) {
        // Guarded on plan_status='active' so a concurrent payment (which
        // flips it elsewhere) can't be clobbered back to 'due' by this sweep.
        const { data: updated, error: updateError } = await admin
            .from("bookings")
            .update({ plan_status: "due" })
            .eq("id", row.id)
            .eq("plan_status", "active")
            .select("id")
            .maybeSingle();

        if (updateError) {
            console.error("[payment-overdue-sweep] update failed", { bookingId: row.id, error: updateError });
            continue;
        }
        if (!updated) continue;
        flipped++;

        await admin.from("audit_logs").insert({
            actor_id: null,
            target_user_id: row.user_id,
            action: "plan.due",
            entity_type: "booking",
            entity_id: row.id,
            after_data: { plan_status: "due" },
            request_context: { source: "payment-overdue-sweep" },
        });

        const title = "Payment Overdue";
        const body = "Your weekly rental payment is overdue. Please complete the payment to continue your rental.";

        const { data: inserted } = await admin
            .from("notifications_log")
            .insert({
                user_id: row.user_id, channel: "push", template: "payment_overdue",
                payload: { title, body, screen: "billing" }, status: "pending",
            })
            .select("id")
            .single();

        const user = unwrap<{ push_token: string | null }>(row.users);
        if (!inserted || !user?.push_token) continue;

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
            console.error("[payment-overdue-sweep] push send threw", { bookingId: row.id, err });
            await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
        }
    }

    return json({ candidates: overdue?.length ?? 0, flipped, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
