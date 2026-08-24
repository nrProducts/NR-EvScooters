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
import { notifyStaff } from "../_shared/notifyStaff.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "booking-payment-expiry-sweep";

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    // A booking with NO deadline is expired on age instead.
    //
    // The original filter required `hold_expires_at is not null`, and for a
    // long time nothing wrote that column — so every abandoned checkout was
    // invisible to this sweep, kept its scooter reserved, and locked the rider
    // out of booking again (ACTIVE_BOOKING_STATUSES includes pending_payment).
    // createBooking now sets the deadline, but this sweep must not depend on
    // any single writer remembering to: a null deadline is treated as
    // `created_at + the same grace period`, so a future code path that forgets
    // the column degrades to "cleaned up a bit later" rather than "never".
    const nowIso = new Date().toISOString();
    const graceMinutes = Number(Deno.env.get("BOOKING_PAYMENT_GRACE_MINUTES") ?? "30");
    const staleBeforeIso = new Date(Date.now() - graceMinutes * 60_000).toISOString();

    const { data: candidates, error } = await admin
        .from("bookings")
        .select("id, user_id")
        .eq("status", "pending_payment")
        .or(`hold_expires_at.lt.${nowIso},and(hold_expires_at.is.null,created_at.lt.${staleBeforeIso})`);

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    // Close checkout sessions whose TTL has passed, before deciding which
    // bookings to expire.
    //
    // `payment_order_status` has always had an `expired` label and nothing
    // ever wrote it, so idx_payment_orders_expiry served a sweep that did not
    // exist. Without this, an abandoned order sits at `created` forever and
    // uq_payment_orders_open_per_invoice (migration 47) then blocks the rider
    // from ever opening a fresh one at the current price.
    //
    // The function skips any order with a succeeded transaction against it,
    // so a capture landing mid-sweep is never expired out from under itself.
    const { data: expiredOrders, error: expireError } = await admin
        .rpc("expire_stale_payment_orders");
    if (expireError) {
        // Not fatal: booking expiry below is the load-bearing part, and a
        // stale order is a nuisance rather than a money problem.
        console.error(`[${SOURCE}] payment order expiry failed`, expireError);
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

        // A rider who never completed payment is a pending-payment case admin
        // ops should see, same as payment_overdue — this was the one abandoned-
        // checkout path with no staff-facing copy at all.
        await notifyStaff(admin, {
            typeCode: "booking_expired",
            subjectType: "booking",
            subjectId: row.id,
            title: "Booking Expired — Payment Not Completed",
            body: "A rider's booking hold expired without payment.",
            screen: "/bookings",
            payload: { rider_id: row.user_id },
        });
    }

    return json(
        {
            candidates: candidates?.length ?? 0,
            expired,
            subscriptionsCancelled,
            paymentOrdersExpired: expiredOrders ?? 0,
        },
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
