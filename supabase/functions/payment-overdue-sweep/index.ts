// =========================================================================
// payment-overdue-sweep  —  daily pg_cron job
//
// Once a subscription period's due date passes, this does ONE of two things:
//
//   - a PAID `scheduled` next period exists (the rider renewed ahead — see
//     applyRenewalSuccess in apps/backend/src/modules/payments/payments
//     .service.ts): PROMOTE it. Close the lapsed period, make the scheduled
//     one `current`, and the plan simply carries on.
//   - otherwise: mark the subscription `past_due`.
//
// "PAID" is doing real work in that first line — see findScheduledPeriod.
// The row alone is no longer evidence of a renewal, because the renewal
// preview creates it before the rider has paid anything.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// The whole subject of this sweep moved. It used to read four columns on
// `bookings` — plan_status, next_due_at, renewal_status, scheduled_start_date
// — and write them back. Billing is a property of the PERIOD now, so the
// sweep walks `subscription_periods` and the "pay now, activate later"
// design is expressed with rows: paying inserts the next period as
// `scheduled`, and this is the only thing that promotes it. There is no
// renewal_status to reset and no dates to recompute, because the scheduled
// row already carries them.
//
// This sweep no longer generates invoices at all. Periods are billed in
// ADVANCE — the current one was paid for before it started — so the bill a
// lapsed rider owes is for the NEXT period, which the renewal path raises.
// See markPastDue.
//
// Every date comparison goes through business_today(). The old todayIso()
// read the Deno clock, which is UTC: between 18:30 and midnight IST it
// believed it was already tomorrow and marked riders overdue a day early.
//
// A 'scheduled' next period is no longer proof of payment on its own.
// apps/backend/src/modules/billing/billing.service.ts's advanceToNextPeriod
// now creates that row eagerly, the moment a rider previews a renewal
// (requestEarlyRecharge) — before any payment — because the invoice needs
// a real period to attach to. A rider who previews and cancels, or never
// pays, leaves exactly this row behind: 'scheduled', unpaid. findScheduledPeriod
// below checks the period's own invoice is actually settled before this sweep
// promotes it, or an abandoned preview would eventually get promoted into a
// free, unpaid rental period.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";
import { notifyStaff } from "../_shared/notifyStaff.ts";
import { writeAudit } from "../_shared/audit.ts";

const SOURCE = "payment-overdue-sweep";

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface PeriodRow {
    id: string;
    subscription_id: string;
    sequence_number: number;
    due_on: string;
    ends_on: string;
    subscriptions: { id: string; user_id: string; status: string } | null;
}

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

    const { data: lapsed, error } = await admin
        .from("subscription_periods")
        .select(
            "id, subscription_id, sequence_number, due_on, ends_on, subscriptions(id, user_id, status)",
        )
        .eq("status", "current")
        .lt("due_on", today);

    if (error) {
        console.error(`[${SOURCE}] query failed`, error);
        return json({ error: "Query failed." }, 500);
    }

    let promoted = 0;
    let markedPastDue = 0;

    for (const period of (lapsed ?? []) as unknown as PeriodRow[]) {
        const subscription = unwrap<{ id: string; user_id: string; status: string }>(
            period.subscriptions,
        );
        // A period whose subscription has already ended or been cancelled is
        // not overdue, it is finished — closing it is all that is left.
        if (!subscription) continue;
        if (subscription.status === "ended" || subscription.status === "cancelled") {
            await closePeriod(admin, period.id);
            continue;
        }

        const next = await findScheduledPeriod(admin, period.subscription_id, period.sequence_number);
        if (next) {
            if (await promotePeriod(admin, period, next, subscription)) promoted++;
            continue;
        }

        if (await markPastDue(admin, period, subscription, today)) markedPastDue++;
    }

    return json({ candidates: lapsed?.length ?? 0, promoted, markedPastDue }, 200);
});

async function closePeriod(admin: Admin, periodId: string): Promise<void> {
    await admin
        .from("subscription_periods")
        .update({ status: "closed" })
        .eq("id", periodId)
        .eq("status", "current");
}

/**
 * The next period, if the rider PAID AHEAD — its existence alone is no longer
 * proof of that (see this file's header).
 *
 * It used to be: applyRenewalSuccess only inserted the row once a capture had
 * been applied. The renewal preview creates it up front now, because the
 * invoice the rider is about to pay has to hang off a period, so promoting on
 * existence alone would renew a plan for free the moment a rider opened the
 * renewal screen and closed the app. A 'scheduled' row with no settled
 * invoice is an abandoned preview, not a paid-ahead renewal.
 *
 * `is_paid` comes from v_invoice_balances, i.e. from money actually
 * allocated — the same authority everything else uses.
 */
async function findScheduledPeriod(
    admin: Admin,
    subscriptionId: string,
    currentSequence: number,
): Promise<{ id: string; starts_on: string; ends_on: string } | null> {
    const { data, error } = await admin
        .from("subscription_periods")
        .select("id, starts_on, ends_on, invoices(id)")
        .eq("subscription_id", subscriptionId)
        .eq("status", "scheduled")
        .eq("sequence_number", currentSequence + 1)
        .maybeSingle();
    if (error) {
        console.error(`[${SOURCE}] scheduled period lookup failed`, {
            subscriptionId,
            error: error.message,
        });
        return null;
    }
    if (!data) return null;

    const invoice = unwrap<{ id: string }>(data.invoices);
    if (!invoice) return null; // Scheduled with no invoice at all — nothing was even previewed to pay.

    const { data: balance, error: balanceError } = await admin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
    if (balanceError) {
        console.error(`[${SOURCE}] scheduled period invoice balance lookup failed`, {
            subscriptionId,
            invoiceId: invoice.id,
            error: balanceError.message,
        });
        return null;
    }
    // Unpaid — an abandoned preview, not a pre-paid renewal. The rider is
    // behind, and markPastDue below is the right answer.
    if (!balance?.is_paid) return null;

    return { id: data.id, starts_on: data.starts_on, ends_on: data.ends_on };
}

/**
 * Close the lapsed period, open the paid-for one.
 *
 * Order is load-bearing: only one period per subscription may be `current`,
 * so the old one closes first. Both updates are guarded on the status they
 * were read at, which makes a second run of the sweep — or a race with a
 * late capture doing the same promotion — a no-op rather than a double
 * advance.
 */
async function promotePeriod(
    admin: Admin,
    period: PeriodRow,
    next: { id: string; starts_on: string; ends_on: string },
    subscription: { id: string; user_id: string; status: string },
): Promise<boolean> {
    const { data: closed, error: closeError } = await admin
        .from("subscription_periods")
        .update({ status: "closed" })
        .eq("id", period.id)
        .eq("status", "current")
        .select("id")
        .maybeSingle();
    if (closeError || !closed) {
        if (closeError) {
            console.error(`[${SOURCE}] could not close lapsed period`, {
                periodId: period.id,
                error: closeError,
            });
        }
        return false;
    }

    const { error: openError } = await admin
        .from("subscription_periods")
        .update({ status: "current" })
        .eq("id", next.id)
        .eq("status", "scheduled");
    if (openError) {
        console.error(`[${SOURCE}] could not open scheduled period`, {
            periodId: next.id,
            error: openError,
        });
        return false;
    }

    // A rider who paid late was left `past_due` by the capture; the plan is
    // running again now.
    if (subscription.status === "past_due") {
        await admin
            .from("subscriptions")
            .update({ status: "active" })
            .eq("id", subscription.id)
            .eq("status", "past_due");
    }

    await writeAudit(admin, {
        targetUserId: subscription.user_id,
        action: "plan.renewed",
        entityType: "subscription",
        entityId: subscription.id,
        before: { period_id: period.id, sequence_number: period.sequence_number },
        after: {
            period_id: next.id,
            sequence_number: period.sequence_number + 1,
            starts_on: next.starts_on,
            ends_on: next.ends_on,
        },
        source: SOURCE,
    });

    await notifyUser(admin, subscription.user_id, {
        typeCode: "plan_renewed",
        subjectType: "subscription_period",
        subjectId: next.id,
        title: "Plan Renewed",
        body: "Your renewed plan is now active.",
        screen: "billing",
        payload: { subscription_id: subscription.id },
    });
    return true;
}

/**
 * Nothing was paid ahead, so the rider is behind.
 *
 * `past_due` lives on the subscription now rather than on the booking, and
 * this is the only thing that sets it — a capture is the only thing that
 * clears it. The lapsed period stays `current` deliberately: it is still the
 * period being billed for, and closing it would leave the subscription with
 * no current period at all.
 */
async function markPastDue(
    admin: Admin,
    period: PeriodRow,
    subscription: { id: string; user_id: string; status: string },
    today: string,
): Promise<boolean> {
    // No invoice is generated here any more, and that is the correction.
    //
    // Periods are billed IN ADVANCE on this platform: the current period was
    // paid for before it began, so `generate_period_invoice` on it either
    // handed back that settled invoice or — worse — billed the rider a second
    // time for a week they had already bought. The bill that is actually owed
    // is for the NEXT period, and the renewal path raises that one.
    //
    // The old unpaid-invoice gate went with it. It asked "does this
    // subscription have ANY unpaid invoice?", which for a rider whose cycles
    // are all settled is no — so a plan that lapsed with nothing outstanding
    // was never marked past_due at all, and sat reading `active` days after
    // it had expired. Lapsing IS the condition: the period ran out and no
    // paid renewal exists (findScheduledPeriod above already checked that).
    if (subscription.status !== "active") return false;

    const { data: updated, error } = await admin
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("id", subscription.id)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
    if (error || !updated) {
        if (error) {
            console.error(`[${SOURCE}] past_due update failed`, {
                subscriptionId: subscription.id,
                error,
            });
        }
        return false;
    }

    await writeAudit(admin, {
        targetUserId: subscription.user_id,
        action: "plan.due",
        entityType: "subscription",
        entityId: subscription.id,
        after: { status: "past_due", period_id: period.id, due_on: period.due_on, as_of: today },
        source: SOURCE,
    });

    await notifyUser(admin, subscription.user_id, {
        typeCode: "payment_overdue",
        subjectType: "subscription_period",
        subjectId: period.id,
        title: "Payment Overdue",
        body: "Your rental payment is overdue. Please complete the payment to continue your rental.",
        screen: "billing",
        payload: { subscription_id: subscription.id },
    });

    await notifyStaff(admin, {
        typeCode: "payment_overdue",
        subjectType: "subscription_period",
        subjectId: period.id,
        title: "Payment Due",
        body: "A rider's rental payment is overdue.",
        screen: "/bookings",
        payload: { subscription_id: subscription.id, rider_id: subscription.user_id },
    });
    return true;
}
