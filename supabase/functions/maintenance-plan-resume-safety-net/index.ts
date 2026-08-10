// =========================================================================
// maintenance-plan-resume-safety-net  —  daily pg_cron job
//
// Plan resume is normally event-driven: assignTempVehicle, the handback
// branch of updateMaintenanceTicket, and reassignAfterScrap
// (apps/backend/src/modules/maintenance/maintenance.service.ts) each call
// resumePlanForBooking the moment the rider is riding again. This is only a
// backstop for the case that event-driven path somehow didn't fire (a bug,
// a crashed request mid-flight) — it finds a booking stuck 'paused' whose
// maintenance ticket has already closed, and force-resumes it using the
// exact same day-shift math as
// apps/backend/src/modules/plans/plans.service.ts's computePlanResume
// (re-implemented here; this function can't import backend TS).
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface StuckBookingRow {
    id: string;
    user_id: string;
    plan_paused_at: string;
    next_due_at: string;
    plan_paused_days_total: number;
}

interface OpenPauseEventRow {
    id: string;
    maintenance_ticket_id: string | null;
    paused_at: string;
}

/** Whole calendar days between two instants, local-midnight to local-midnight — same convention as the backend's wholeDaysBetween. */
function wholeDaysBetween(earlier: Date, later: Date): number {
    const a = new Date(earlier); a.setHours(0, 0, 0, 0);
    const b = new Date(later); b.setHours(0, 0, 0, 0);
    return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Postgres `date` arithmetic, UTC-anchored — same convention as the backend's addDays. */
function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: paused, error } = await admin
        .from("bookings")
        .select("id, user_id, plan_paused_at, next_due_at, plan_paused_days_total")
        .eq("plan_status", "paused");

    if (error) {
        console.error("[maintenance-plan-resume-safety-net] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let checked = 0;
    let resumed = 0;

    for (const booking of (paused ?? []) as StuckBookingRow[]) {
        checked++;

        const { data: openEvent } = await admin
            .from("plan_pause_events")
            .select("id, maintenance_ticket_id, paused_at")
            .eq("booking_id", booking.id)
            .is("resumed_at", null)
            .maybeSingle();
        const event = openEvent as OpenPauseEventRow | null;
        if (!event?.maintenance_ticket_id) continue;

        const { data: ticket } = await admin
            .from("vehicle_maintenance")
            .select("status")
            .eq("id", event.maintenance_ticket_id)
            .maybeSingle();
        // Ticket still open — genuinely still paused, nothing to fix.
        if (!ticket || (ticket.status !== "resolved" && ticket.status !== "cancelled")) continue;

        const pausedAt = new Date(event.paused_at);
        const now = new Date();
        const daysPaused = Math.max(0, wholeDaysBetween(pausedAt, now));
        const newNextDueAt = addDays(booking.next_due_at, daysPaused);
        const wasDueAtPauseTime = new Date(`${booking.next_due_at}T00:00:00Z`) <= pausedAt;
        const restoredStatus = wasDueAtPauseTime ? "due" : "active";

        // active_rental_id is deliberately left untouched — this safety net
        // has no reliable way to know which rentals row is now current (that
        // is exactly the piece of information the missed event would have
        // supplied), so it only unsticks the billing clock, not that pointer.
        const { data: updated, error: updateError } = await admin
            .from("bookings")
            .update({
                plan_status: restoredStatus, next_due_at: newNextDueAt, plan_paused_at: null,
                plan_paused_days_total: (booking.plan_paused_days_total ?? 0) + daysPaused,
            })
            .eq("id", booking.id)
            .eq("plan_status", "paused")
            .select("id")
            .maybeSingle();

        if (updateError) {
            console.error("[maintenance-plan-resume-safety-net] update failed", { bookingId: booking.id, error: updateError });
            continue;
        }
        if (!updated) continue;
        resumed++;

        await admin
            .from("plan_pause_events")
            .update({
                resumed_at: now.toISOString(), days_paused: daysPaused,
                resumed_via: "original_handback", new_next_due_at: newNextDueAt,
            })
            .eq("id", event.id);

        await admin.from("audit_logs").insert({
            actor_id: null, target_user_id: booking.user_id, action: "plan.resumed",
            entity_type: "booking", entity_id: booking.id,
            after_data: { plan_status: restoredStatus, next_due_at: newNextDueAt, days_paused: daysPaused, safety_net: true },
            request_context: { source: "maintenance-plan-resume-safety-net" },
        });

        await admin.from("notifications_log").insert({
            user_id: booking.user_id, channel: "push", template: "vehicle_available_again",
            payload: {
                title: "Vehicle Available Again",
                body: "Your vehicle has been assigned back to you and your rental plan has resumed.",
                screen: "billing",
            },
            status: "pending",
        });
    }

    return json({ checked, resumed }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
