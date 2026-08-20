// =========================================================================
// refund-eligibility-sweep  —  daily pg_cron job
//
// Finds deposits past their post-return holding period with no open dispute
// and creates a pending `refunds` row for each. Mirrors initiateRefund() in
// apps/backend/src/modules/refunds/refunds.service.ts, including its
// idempotency guard.
//
// A 'pending' row created here is the TERMINAL automatic state: nothing
// calls the gateway on its own. It waits for a staff member to review the
// settlement and approve it, the same admin gate a cancellation refund has
// always had.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// 1. A deposit belongs to a SUBSCRIPTION, not a booking, and its eligibility
//    column is `refund_eligible_on` — a DATE. Eligibility now begins at the
//    start of that day rather than at the same clock time the deposit was
//    taken, so the comparison is against business_today(), not an instant.
//
// 2. A refund NAMES THE PAYMENT IT REVERSES. `payment_transaction_id` is NOT
//    NULL and replaces `deposit_id` + `booking_id` + `refund_type`. That is
//    why the "which payment do we refund against?" question is answered here,
//    at creation, instead of at gateway time where a wrong guess used to fail
//    the whole refund.
//
// 3. Damage is two tables deep: `incidents` holds what happened to a vehicle
//    on a rental, `damages` holds the money, and `damage_disputes` holds the
//    challenge. A deposit's rentals have to be resolved first to reach any of
//    it — the old single `damages.booking_id` filter has no equivalent.
//
// 4. `deposits.refund_id` is gone, so "does this deposit already have a
//    refund?" is asked of the refunds table through the subscription. There
//    is no mirror column left to disagree with it.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "refund-eligibility-sweep";

interface DepositRow {
    id: string;
    subscription_id: string;
    amount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

Deno.serve(async (_req) => {
    if (!isConfigured()) return notConfigured();
    const admin = adminClient();

    let today: string;
    try {
        today = await businessToday(admin);
    } catch (err) {
        console.error(`[${SOURCE}] could not read business_today()`, err);
        return json({ error: "Could not resolve the business date." }, 500);
    }

    const { data: eligible, error } = await admin
        .from("deposits")
        .select("id, subscription_id, amount")
        .eq("status", "held")
        .not("refund_eligible_on", "is", null)
        .lte("refund_eligible_on", today);

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    let created = 0;
    let skippedDisputed = 0;
    let skippedExisting = 0;
    let skippedNothingToRefund = 0;
    let skippedNoPayment = 0;

    for (const deposit of (eligible ?? []) as DepositRow[]) {
        const rentalIds = await rentalIdsFor(admin, deposit.subscription_id);

        if (await hasOpenDispute(admin, rentalIds)) {
            skippedDisputed++;
            continue;
        }

        if (await hasLiveRefund(admin, deposit.subscription_id)) {
            skippedExisting++;
            continue;
        }

        const damage = await assessedDamage(admin, rentalIds);
        const amount = Math.max(0, round2(Number(deposit.amount) - damage));
        if (amount <= 0) {
            skippedNothingToRefund++;
            continue;
        }

        const payment = await latestCapturedPayment(admin, deposit.subscription_id);
        if (!payment) {
            console.error(`[${SOURCE}] no captured payment to refund against`, {
                depositId: deposit.id,
            });
            skippedNoPayment++;
            continue;
        }

        const { data: refund, error: insertError } = await admin
            .from("refunds")
            .insert({
                user_id: payment.userId,
                payment_transaction_id: payment.id,
                amount,
                reason: "deposit_release",
                status: "pending",
            })
            .select("id")
            .single();
        if (insertError || !refund) {
            console.error(`[${SOURCE}] insert failed`, { depositId: deposit.id, error: insertError });
            continue;
        }
        created++;

        await writeAudit(admin, {
            targetUserId: payment.userId,
            action: "refund.initiated",
            entityType: "refund",
            entityId: refund.id,
            after: { deposit_id: deposit.id, amount, assessed_damage: damage },
            source: SOURCE,
        });

        await notifyUser(admin, payment.userId, {
            typeCode: "refund_initiated",
            subjectType: "refund",
            subjectId: refund.id,
            title: "Refund Initiated",
            body: `Your security deposit refund of ₹${amount} has been initiated.`,
            screen: "my-plan",
            payload: { deposit_id: deposit.id, subscription_id: deposit.subscription_id },
        });
    }

    return json({
        eligible: eligible?.length ?? 0,
        created,
        skippedDisputed,
        skippedExisting,
        skippedNothingToRefund,
        skippedNoPayment,
    }, 200);
});

/** Every rental the subscription has run — damage hangs off these, not the deposit. */
async function rentalIdsFor(admin: Admin, subscriptionId: string): Promise<string[]> {
    const { data, error } = await admin
        .from("rentals")
        .select("id")
        .eq("subscription_id", subscriptionId);
    if (error) {
        console.error(`[${SOURCE}] rental lookup failed`, { subscriptionId, error: error.message });
        return [];
    }
    return (data ?? []).map((r: { id: string }) => r.id);
}

/**
 * An unresolved challenge against any damage on these rentals.
 *
 * Both halves are checked: `damages.status = 'disputed'` is the money being
 * contested, and an unresolved `damage_disputes` row is the rider's actual
 * challenge. They are normally in step, but refunding the deposit out from
 * under either one is not recoverable.
 */
async function hasOpenDispute(admin: Admin, rentalIds: string[]): Promise<boolean> {
    if (rentalIds.length === 0) return false;

    const { data: disputedDamages, error } = await admin
        .from("damages")
        .select("id, incidents!inner(rental_id)")
        .in("incidents.rental_id", rentalIds)
        .eq("status", "disputed")
        .limit(1);
    if (error) {
        console.error(`[${SOURCE}] dispute lookup failed`, { error: error.message });
        // Err towards holding the money: a late refund is fixable, an early
        // one is not.
        return true;
    }
    if ((disputedDamages ?? []).length > 0) return true;

    const { data: openDisputes } = await admin
        .from("damage_disputes")
        .select("id, damages!inner(incident_id, incidents!inner(rental_id))")
        .in("damages.incidents.rental_id", rentalIds)
        .is("resolved_at", null)
        .limit(1);
    return (openDisputes ?? []).length > 0;
}

/** Assessed, undisputed damage — what comes off the deposit. */
async function assessedDamage(admin: Admin, rentalIds: string[]): Promise<number> {
    if (rentalIds.length === 0) return 0;

    const { data, error } = await admin
        .from("damages")
        .select("assessed_amount, incidents!inner(rental_id)")
        .in("incidents.rental_id", rentalIds)
        .neq("status", "disputed");
    if (error) {
        console.error(`[${SOURCE}] damage lookup failed`, { error: error.message });
        // Unknown damage must not become a full refund.
        return Number.POSITIVE_INFINITY;
    }
    return (data ?? []).reduce(
        (sum: number, row: { assessed_amount: number }) => sum + Number(row.assessed_amount),
        0,
    );
}

/** A deposit-release refund already in flight against this subscription. */
async function hasLiveRefund(admin: Admin, subscriptionId: string): Promise<boolean> {
    const { data, error } = await admin
        .from("refunds")
        .select("id, payment_transactions!inner(payment_orders!inner(invoices!inner(subscription_id)))")
        .eq("payment_transactions.payment_orders.invoices.subscription_id", subscriptionId)
        .eq("reason", "deposit_release")
        .in("status", ["pending", "processing", "succeeded"])
        .limit(1);
    if (error) {
        console.error(`[${SOURCE}] existing refund lookup failed`, { error: error.message });
        return true; // Never risk a duplicate refund.
    }
    return (data ?? []).length > 0;
}

/**
 * The most recent captured payment on the subscription — what the money
 * comes back out of.
 *
 * The payer is on the ORDER, not the transaction: a transaction records what
 * the gateway did, and only the order knows whose checkout it was.
 */
async function latestCapturedPayment(
    admin: Admin,
    subscriptionId: string,
): Promise<{ id: string; userId: string } | null> {
    const { data, error } = await admin
        .from("payment_transactions")
        .select("id, payment_orders!inner(user_id, invoices!inner(subscription_id))")
        .eq("payment_orders.invoices.subscription_id", subscriptionId)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;

    const raw = (data as { payment_orders: unknown }).payment_orders;
    const order = (Array.isArray(raw) ? raw[0] : raw) as { user_id: string } | null;
    return order ? { id: (data as { id: string }).id, userId: order.user_id } : null;
}
