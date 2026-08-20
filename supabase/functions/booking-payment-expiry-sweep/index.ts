// =========================================================================
// booking-payment-expiry-sweep  —  pg_cron job, every 15-30 min
//
// A 'pending_payment' booking holds a reserved vehicle indefinitely unless
// something closes it. This expires the ones whose hold has run out, and
// trg_release_vehicle_on_booking_close then frees the held scooter as part
// of that same UPDATE.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// 1. The deadline is a COLUMN now. `bookings.hold_expires_at` is written
//    when the hold is taken, so the sweep no longer reconstructs it from
//    created_at plus a grace constant that had to be kept in step with
//    whatever set the hold. BOOKING_PAYMENT_GRACE_MINUTES is gone with it.
//
// 2. `payment_orders` lost `booking_id` and `purpose`; it has `invoice_id`,
//    and one order pays exactly one invoice. "Was this booking paid?" is
//    therefore asked through the chain the money actually follows —
//    booking → subscription → invoice → order.
//
// 3. There is a SUBSCRIPTION to clean up. The FK chain
//    (payment_orders.invoice_id → invoices.subscription_id, both NOT NULL)
//    forces the subscription, its deposit, period #1 and the opening invoice
//    to exist before a payment can be taken at all — see the header of
//    apps/backend/src/modules/payments/payments.service.ts. So an abandoned
//    checkout leaves an `active` subscription behind, because
//    `subscription_status` has no `pending` value. Expiring the booking
//    without cancelling it would leave a rider with a live plan they never
//    paid for. This is the caller that payments.service.ts's
//    cancelAbandonedSubscription() was written for; its logic is
//    re-implemented below, Deno being unable to import it.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { notifyUser } from "../_shared/notify.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "booking-payment-expiry-sweep";

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    const { data: candidates, error } = await admin
        .from("bookings")
        .select("id, user_id")
        .eq("status", "pending_payment")
        .not("hold_expires_at", "is", null)
        .lt("hold_expires_at", new Date().toISOString());

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    let expired = 0;
    let subscriptionsCancelled = 0;

    for (const row of (candidates ?? []) as Array<{ id: string; user_id: string }>) {
        if (await hasSettledPayment(admin, row.id)) continue;

        // Guarded on the status we read: a payment that landed between the
        // query and here has already moved the booking on, and this update
        // then matches nothing rather than clobbering it back to expired.
        const { data: updated, error: updateError } = await admin
            .from("bookings")
            .update({ status: "expired" })
            .eq("id", row.id)
            .eq("status", "pending_payment")
            .select("id")
            .maybeSingle();

        if (updateError) {
            console.error(`[${SOURCE}] update failed`, { bookingId: row.id, error: updateError });
            continue;
        }
        if (!updated) continue;
        expired++;

        if (await cancelAbandonedSubscription(admin, row.id)) subscriptionsCancelled++;

        await writeAudit(admin, {
            targetUserId: row.user_id,
            action: "booking.cancelled",
            entityType: "booking",
            entityId: row.id,
            after: { status: "expired", reason: "payment_not_completed" },
            source: SOURCE,
        });

        await notifyUser(admin, row.user_id, {
            typeCode: "booking_expired",
            subjectType: "booking",
            subjectId: row.id,
            title: "Booking Expired",
            body: "Your reservation expired because payment wasn't completed in time. Please book again.",
            screen: "home",
        });
    }

    return json(
        { candidates: candidates?.length ?? 0, expired, subscriptionsCancelled },
        200,
    );
});

/**
 * Did any money actually land against this booking?
 *
 * `payment_allocations` is the answer rather than `payment_orders.status`:
 * an allocation exists only once a captured transaction has been applied to
 * an invoice, so it cannot be true of an order that is merely mid-flight.
 * An order sitting at 'paid' while applyPaymentSuccess is still running is
 * exactly the case that must NOT be expired, which is why the `paid` order
 * is checked too.
 */
async function hasSettledPayment(admin: Admin, bookingId: string): Promise<boolean> {
    const { data: subscription } = await admin
        .from("subscriptions")
        .select("id")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (!subscription) return false;

    const { data: allocated } = await admin
        .from("payment_allocations")
        .select("id, invoices!inner(subscription_id)")
        .eq("invoices.subscription_id", subscription.id)
        .limit(1);
    if ((allocated ?? []).length > 0) return true;

    const { data: paidOrder } = await admin
        .from("payment_orders")
        .select("id, invoices!inner(subscription_id)")
        .eq("invoices.subscription_id", subscription.id)
        .eq("status", "paid")
        .limit(1);
    return (paidOrder ?? []).length > 0;
}

/**
 * Cancels the subscription an abandoned checkout left behind.
 *
 * Mirrors cancelAbandonedSubscription() in payments.service.ts, including
 * its guard: only a subscription still `active` with nothing ever allocated
 * against it is cancelled. Anything else is a real plan.
 */
async function cancelAbandonedSubscription(admin: Admin, bookingId: string): Promise<boolean> {
    const { data: subscription, error } = await admin
        .from("subscriptions")
        .select("id, status, user_id")
        .eq("booking_id", bookingId)
        .maybeSingle();
    if (error || !subscription || subscription.status !== "active") return false;

    const { data: allocated } = await admin
        .from("payment_allocations")
        .select("id, invoices!inner(subscription_id)")
        .eq("invoices.subscription_id", subscription.id)
        .limit(1);
    if ((allocated ?? []).length > 0) return false;

    const { data: cancelled, error: cancelError } = await admin
        .from("subscriptions")
        .update({ status: "cancelled", ended_at: new Date().toISOString() })
        .eq("id", subscription.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
    if (cancelError || !cancelled) {
        if (cancelError) {
            console.error(`[${SOURCE}] subscription cancel failed`, {
                bookingId,
                error: cancelError,
            });
        }
        return false;
    }

    // The deposit was created 'pending' alongside the subscription and was
    // never held, so it is released rather than forfeited — there is no
    // money behind it to keep.
    await admin
        .from("deposits")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("subscription_id", subscription.id)
        .eq("status", "pending");

    await writeAudit(admin, {
        targetUserId: subscription.user_id,
        action: "plan.updated",
        entityType: "subscription",
        entityId: subscription.id,
        after: { status: "cancelled", reason: "checkout abandoned" },
        source: SOURCE,
    });
    return true;
}
