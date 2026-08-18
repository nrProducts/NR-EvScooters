// =========================================================================
// payment-overdue-sweep  —  daily pg_cron job
//
// Once a booking's next_due_at passes, this does ONE of two things:
//
//   - renewal_status = 'scheduled' (the rider already paid ahead via
//     Renew Plan — see bookings.service.ts's requestEarlyRecharge and
//     payments.service.ts's applyWeeklyDueSuccess): ACTIVATE the scheduled
//     period. This is the "pay now, activate later" design's other half —
//     paying early never touches current_period_start/next_due_at itself,
//     this sweep is the only thing that does, and only once the old period
//     has actually run out.
//   - otherwise: flip plan_status 'active' -> 'due' (nothing else in the
//     app writes plan_status='due') and open the invoice that period is
//     payable through, exactly as before this feature existed.
//
// Writes an audit_logs row directly (can't import common/audit.ts's
// writeAudit from Deno) and notifies the rider, following the same "log
// first, best-effort push" contract as the backend's notifyUser().
//
// Invoice creation itself is delegated to fn_generate_weekly_invoice (see
// 20260817100000_billing_charge_engine.sql) via RPC rather than a plain
// insert here — that single Postgres function is also called by the Node
// backend's on-demand path, so it's the one place "what does this rider owe
// this cycle" (base rental + eligible charge_rules, e.g. the Transaction
// Fee every N cycles) is computed, and it's idempotent against being
// re-run.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface BookingRow {
    id: string;
    user_id: string;
    next_due_at: string;
    renewal_status: "none" | "scheduled";
    scheduled_start_date: string | null;
    scheduled_duration_days: number | null;
    billing_cycle_number: number;
    // Aliased below as `users:users!bookings_user_id_fkey(...)` — bookings has
    // TWO fkeys to users (user_id and cancelled_by), so the embed is ambiguous
    // without naming which one PostgREST should follow.
    users: { push_token: string | null } | { push_token: string | null }[] | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Postgres `date` arithmetic done in JS, UTC-anchored — mirrors apps/backend/src/common/dates.ts's addDays (not importable from Deno). */
function addDaysIso(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: overdue, error } = await admin
        .from("bookings")
        .select(
            "id, user_id, next_due_at, renewal_status, scheduled_start_date, scheduled_duration_days, billing_cycle_number, users:users!bookings_user_id_fkey(push_token)",
        )
        .eq("plan_status", "active")
        .lt("next_due_at", todayIso());

    if (error) {
        console.error("[payment-overdue-sweep] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let flipped = 0;
    let activated = 0;
    let sent = 0;

    for (const row of (overdue ?? []) as unknown as BookingRow[]) {
        const user = unwrap<{ push_token: string | null }>(row.users);

        if (row.renewal_status === "scheduled" && row.scheduled_start_date && row.scheduled_duration_days) {
            // Rider already paid ahead — activate the period they paid for
            // instead of marking them overdue. Guarded on renewal_status so a
            // re-run of the sweep (or a race with a duplicate payment
            // delivery) can't double-activate.
            const newNextDueAt = addDaysIso(row.scheduled_start_date, row.scheduled_duration_days);
            const { data: updated, error: updateError } = await admin
                .from("bookings")
                .update({
                    plan_status: "active",
                    current_period_start: row.scheduled_start_date,
                    next_due_at: newNextDueAt,
                    billing_cycle_number: row.billing_cycle_number + 1,
                    renewal_status: "none",
                    scheduled_start_date: null,
                    scheduled_duration_days: null,
                    renewal_invoice_id: null,
                })
                .eq("id", row.id)
                .eq("renewal_status", "scheduled")
                .select("id")
                .maybeSingle();

            if (updateError) {
                console.error("[payment-overdue-sweep] activation update failed", { bookingId: row.id, error: updateError });
                continue;
            }
            if (!updated) continue;
            activated++;

            await admin.from("audit_logs").insert({
                actor_id: null,
                target_user_id: row.user_id,
                action: "plan.renewed",
                entity_type: "booking",
                entity_id: row.id,
                after_data: { plan_status: "active", current_period_start: row.scheduled_start_date, next_due_at: newNextDueAt },
                request_context: { source: "payment-overdue-sweep" },
            });

            const title = "Plan Renewed";
            const body = "Your renewed plan is now active.";
            const { data: inserted } = await admin
                .from("notifications_log")
                .insert({
                    user_id: row.user_id, channel: "push", template: "plan_renewed",
                    payload: { title, body, screen: "billing" }, status: "pending",
                })
                .select("id")
                .single();

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
            continue;
        }

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

        // Full plan price (no referral discount — that's a one-time
        // first-booking incentive, never repeated on renewals) plus whatever
        // charge_rules are eligible this cycle (e.g. the Transaction Fee
        // every N cycles) — see fn_generate_weekly_invoice's own comment.
        // Idempotent: re-running the sweep for this booking/due-date returns
        // the same invoice id rather than creating a duplicate.
        const { error: invoiceError } = await admin.rpc("fn_generate_weekly_invoice", { p_booking_id: row.id });
        if (invoiceError) {
            console.error("[payment-overdue-sweep] invoice generation failed", { bookingId: row.id, error: invoiceError });
        }

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

    return json({ candidates: overdue?.length ?? 0, flipped, activated, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
