// =========================================================================
// failed-payment-retry  —  hourly pg_cron job
//
// Razorpay orders can't be silently re-charged from the server — the rider
// has to go through Checkout again. This just re-surfaces a "please pay"
// notification for any booking still stuck in 'pending_payment' with a
// failed payment_orders row, so a rider who backed out of checkout doesn't
// just quietly lose their reservation to booking-payment-expiry-sweep
// without ever being nudged. Sends at most once per hour per booking (the
// job's own cadence), not once per failed order.
// =========================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface FailedOrderRow {
    booking_id: string | null;
    user_id: string;
}

Deno.serve(async (_req) => {
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Function not configured." }, 500);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });

    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

    const { data: failedOrders, error } = await admin
        .from("payment_orders")
        .select("booking_id, user_id")
        .eq("status", "failed")
        .gte("updated_at", oneHourAgo);

    if (error) {
        console.error("[failed-payment-retry] query failed", error);
        return json({ error: "Query failed." }, 500);
    }

    // One reminder per booking, even if it has several failed order attempts.
    const seen = new Set<string>();
    let sent = 0;
    let logged = 0;

    for (const row of (failedOrders ?? []) as FailedOrderRow[]) {
        if (!row.booking_id || seen.has(row.booking_id)) continue;

        const { data: booking } = await admin
            .from("bookings")
            .select("id, status")
            .eq("id", row.booking_id)
            .maybeSingle();
        if (!booking || booking.status !== "pending_payment") continue;
        seen.add(row.booking_id);

        const title = "Payment Failed";
        const body = "Your payment didn't go through. Please try again to keep your reservation.";
        const { data: inserted } = await admin
            .from("notifications_log")
            .insert({
                user_id: row.user_id, channel: "push", template: "payment_failed_retry",
                payload: { title, body, screen: "booking/billing" }, status: "pending",
            })
            .select("id")
            .single();
        if (!inserted) continue;
        logged++;

        const { data: user } = await admin.from("users").select("push_token").eq("id", row.user_id).maybeSingle();
        if (!user?.push_token) continue;

        try {
            const res = await fetch(EXPO_PUSH_URL, {
                method: "POST",
                headers: { "content-type": "application/json", accept: "application/json" },
                body: JSON.stringify({ to: user.push_token, title, body, sound: "default", data: { screen: "booking/billing" } }),
            });
            const result = await res.json().catch(() => null);
            const ok = res.ok && result?.data?.status !== "error";
            await admin
                .from("notifications_log")
                .update({ status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
                .eq("id", inserted.id);
            if (ok) sent++;
        } catch (err) {
            console.error("[failed-payment-retry] push send threw", { bookingId: row.booking_id, err });
            await admin.from("notifications_log").update({ status: "failed" }).eq("id", inserted.id);
        }
    }

    return json({ candidates: failedOrders?.length ?? 0, logged, sent }, 200);
});

function json(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
