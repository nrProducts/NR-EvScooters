// =========================================================================
// payment-due-reminder  —  daily pg_cron job  →  Expo push
//
// Reminds a rider on a running plan that their payment is coming up: 3 days
// before, 1 day before, and on the due date itself (configurable via
// PAYMENT_DUE_REMINDER_DAYS). Runs once a day against a period's fixed
// due_on, so each offset matches exactly once per period — the same reason
// pickup-reminder needs no already-reminded tracking.
//
// ── What the new schema changed ──────────────────────────────────────────
//
// The due date is `subscription_periods.due_on`, not `bookings.next_due_at`,
// and the amount owed is the PERIOD's `base_amount_snapshot` rather than the
// plan's current price. That difference is the point of the snapshot: a
// rider mid-plan owes what they agreed to, so a price rise published today
// must not change the figure in tonight's reminder.
//
// A rider who has already RENEWED is skipped. The old version could not tell
// — `bookings.plan_status` said 'active' whether or not the cycle's invoice
// was settled — so a rider who paid early still got nagged. Paid-ness now
// comes from v_invoice_balances, which derives it from the allocations.
//
// Which INVOICE that is matters: see isRenewalPaid. Periods are paid for in
// advance, so "is the current period paid?" is true for everyone and skipped
// the reminder for every rider in good standing.
//
// Offsets are counted from business_today(), so "due in 1 day" means the
// business day, not whatever day it is in UTC.
// =========================================================================

import { adminClient, isConfigured, json, notConfigured, type Admin } from "../_shared/client.ts";
import { addDays, businessToday } from "../_shared/dates.ts";
import { notifyUser } from "../_shared/notify.ts";

const SOURCE = "payment-due-reminder";

/** Days-before-due to remind at. 0 = due today. */
const REMINDER_DAYS: number[] = (Deno.env.get("PAYMENT_DUE_REMINDER_DAYS") ?? "3,1,0")
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0);

interface PeriodRow {
    id: string;
    subscription_id: string;
    sequence_number: number;
    due_on: string;
    base_amount_snapshot: number;
    subscriptions: { id: string; user_id: string; status: string } | null;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function messageFor(daysUntilDue: number, amount: number): { title: string; body: string } {
    if (daysUntilDue === 0) {
        return {
            title: "Payment Due Today",
            body: `Your rental payment of ₹${amount} is due today.`,
        };
    }
    return {
        title: "Payment Due Soon",
        body: `Your rental payment of ₹${amount} is due in ${daysUntilDue} day${daysUntilDue === 1 ? "" : "s"}.`,
    };
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

    let matched = 0;
    let logged = 0;
    let sent = 0;
    let skippedPaid = 0;

    for (const offsetDays of REMINDER_DAYS) {
        const { data: periods, error } = await admin
            .from("subscription_periods")
            .select(
                "id, subscription_id, sequence_number, due_on, base_amount_snapshot, subscriptions(id, user_id, status)",
            )
            .eq("status", "current")
            .eq("due_on", addDays(today, offsetDays));

        if (error) {
            console.error(`[${SOURCE}] query failed`, { offsetDays, error });
            continue;
        }

        for (const period of (periods ?? []) as unknown as PeriodRow[]) {
            const subscription = unwrap<{ id: string; user_id: string; status: string }>(
                period.subscriptions,
            );
            if (!subscription) continue;
            // Reminding a paused, ended or cancelled plan about a payment is
            // a message about something that is not happening.
            if (subscription.status !== "active" && subscription.status !== "past_due") continue;
            matched++;

            if (await isRenewalPaid(admin, period)) {
                skippedPaid++;
                continue;
            }

            const { title, body } = messageFor(offsetDays, Number(period.base_amount_snapshot));
            const result = await notifyUser(admin, subscription.user_id, {
                typeCode: "payment_due",
                subjectType: "subscription_period",
                subjectId: period.id,
                title,
                body,
                screen: "billing",
                payload: { subscription_id: subscription.id, due_on: period.due_on },
            });
            if (result.logged) logged++;
            if (result.sent) sent++;
        }
    }

    return json({ matched, logged, sent, skippedPaid }, 200);
});

/**
 * Has the rider already RENEWED — i.e. paid for the period after this one?
 *
 * This used to ask whether the CURRENT period's own invoice was settled,
 * which sounds equivalent and is not. Periods are billed in ADVANCE: the
 * period now running was paid for before it began, so that question answers
 * "yes" for every rider in good standing, every time — and the reminder that
 * their plan is about to run out was skipped for exactly the people who
 * needed it. Only a rider already in arrears got told anything.
 *
 * What is due three days before the plan ends is the NEXT period. A period
 * with no row yet has certainly not been paid for.
 */
async function isRenewalPaid(admin: Admin, period: PeriodRow): Promise<boolean> {
    const { data: next } = await admin
        .from("subscription_periods")
        .select("id")
        .eq("subscription_id", period.subscription_id)
        .eq("sequence_number", period.sequence_number + 1)
        .maybeSingle();
    if (!next) return false;

    const { data: invoice } = await admin
        .from("invoices")
        .select("id")
        .eq("subscription_period_id", next.id)
        .neq("status", "void")
        .maybeSingle();
    if (!invoice) return false;

    const { data: balance } = await admin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
    return balance?.is_paid === true;
}
