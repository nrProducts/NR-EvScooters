// =========================================================================
// failed-payment-retry  —  hourly pg_cron job
//
// Razorpay orders can't be silently re-charged from the server — the rider
// has to go through Checkout again. This re-surfaces a "please pay" nudge
// for any booking still in 'pending_payment' with a recent failed order, so
// a rider who backed out of checkout doesn't quietly lose their reservation
// to booking-payment-expiry-sweep without ever being told. At most one
// reminder per booking per run.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// `payment_orders` lost `booking_id`: it has `invoice_id`, and one order
// pays exactly one invoice. Getting from a failed order back to the booking
// it was for is now the chain the money follows —
// order → invoice → subscription → booking — which is also the chain that
// makes the booking's own status trustworthy, since the subscription is
// created at checkout rather than at capture.
//
// The push token moved to `user_devices`, so there is no `users.push_token`
// read here at all; _shared/notify.ts fans out to every live device.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured } from "../_shared/client.ts";
import { notifyUser } from "../_shared/notify.ts";

const SOURCE = "failed-payment-retry";

interface FailedOrderRow {
    id: string;
    user_id: string;
    invoices:
        | { subscriptions: unknown }
        | Array<{ subscriptions: unknown }>
        | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    const oneHourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

    const { data: failedOrders, error } = await admin
        .from("payment_orders")
        .select("id, user_id, invoices!inner(subscriptions!inner(bookings!inner(id, status)))")
        .eq("status", "failed")
        .gte("updated_at", oneHourAgo);

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    // One reminder per booking, however many failed attempts it collected.
    const seen = new Set<string>();
    let logged = 0;
    let sent = 0;

    for (const row of (failedOrders ?? []) as unknown as FailedOrderRow[]) {
        const invoice = unwrap<{ subscriptions: unknown }>(row.invoices);
        const subscription = unwrap<{ bookings: unknown }>(invoice?.subscriptions);
        const booking = unwrap<{ id: string; status: string }>(subscription?.bookings);

        if (!booking || booking.status !== "pending_payment") continue;
        if (seen.has(booking.id)) continue;
        seen.add(booking.id);

        const result = await notifyUser(admin, row.user_id, {
            typeCode: "payment_failed",
            subjectType: "booking",
            subjectId: booking.id,
            title: "Payment Failed",
            body: "Your payment didn't go through. Please try again to keep your reservation.",
            screen: "booking/billing",
        });
        if (result.logged) logged++;
        if (result.sent) sent++;
    }

    return json({ candidates: failedOrders?.length ?? 0, logged, sent }, 200);
});
