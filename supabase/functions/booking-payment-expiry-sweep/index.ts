// =========================================================================
// booking-payment-expiry-sweep  —  pg_cron job, every 15-30 min
//
// A 'pending_payment' booking holds a reserved vehicle (see
// allocate_vehicle_for_booking, 20260727095801_vehicle_status_lifecycle.sql)
// indefinitely unless something closes it. This finds bookings older than
// BOOKING_PAYMENT_GRACE_MINUTES with no successful payment and expires them
// — trg_release_vehicle_on_booking_close_fn (same migration) then frees the
// held vehicle automatically as part of that UPDATE.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GRACE_MINUTES = Number.parseInt(Deno.env.get("BOOKING_PAYMENT_GRACE_MINUTES") ?? "30", 10);
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const cutoff = new Date(Date.now() - GRACE_MINUTES * 60_000).toISOString();

    const { data: candidates, error } = await admin
        .from("bookings")
        .select("id")
        .eq("status", "pending_payment")
        .lt("created_at", cutoff);

    if (error) {
        console.error("[booking-payment-expiry-sweep] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    let expired = 0;

    for (const row of candidates ?? []) {
        // A payment_orders row still 'created'/'attempted' (or none at all)
        // means no successful payment ever landed for this booking — safe to
        // expire. One with status='paid' means applyPaymentSuccess is mid-
        // flight or already flipped the booking elsewhere; skip it.
        const { data: paidOrder } = await admin
            .from("payment_orders")
            .select("id")
            .eq("booking_id", row.id)
            .eq("purpose", "booking_initial")
            .eq("status", "paid")
            .maybeSingle();
        if (paidOrder) continue;

        const { data: updated, error: updateError } = await admin
            .from("bookings")
            .update({ status: "expired" })
            .eq("id", row.id)
            .eq("status", "pending_payment")
            .select("id, user_id")
            .maybeSingle();

        if (updateError) {
            console.error("[booking-payment-expiry-sweep] update failed", { bookingId: row.id, error: updateError });
            continue;
        }
        if (!updated) continue;
        expired++;

        await admin.from("audit_logs").insert({
            actor_id: null,
            target_user_id: updated.user_id,
            action: "booking.cancelled",
            entity_type: "booking",
            entity_id: row.id,
            after_data: { status: "expired", reason: "payment_not_completed" },
            request_context: { source: "booking-payment-expiry-sweep" },
        });

        const title = "Booking Expired";
        const body = "Your reservation expired because payment wasn't completed in time. Please book again.";
        const { data: inserted } = await admin
            .from("notifications_log")
            .insert({
                user_id: updated.user_id, channel: "push", template: "booking_expired",
                payload: { title, body, screen: "home" }, status: "pending",
            })
            .select("id")
            .single();

        const { data: user } = await admin.from("users").select("push_token").eq("id", updated.user_id).maybeSingle();
        if (!inserted || !user?.push_token) continue;

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
        } catch (err) {
            console.error("[booking-payment-expiry-sweep] push send threw", { bookingId: row.id, err });
            await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
        }
    }

    return json({ candidates: candidates?.length ?? 0, expired }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
