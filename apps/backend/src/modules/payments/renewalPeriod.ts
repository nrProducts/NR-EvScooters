import { supabaseAdmin } from "../../config/supabase";

/**
 * IS THIS SCHEDULED PERIOD ACTUALLY A RENEWAL?
 *
 * Worth stating the model plainly, because the answer used to be assumed.
 *
 * Every period is paid FOR IN ADVANCE. Period 1 is paid at checkout, with the
 * deposit, before the rider ever picks the scooter up. So when period 1 runs
 * out, what the rider owes is period 2 — a bill that does not exist yet, and
 * `generate_period_invoice` is idempotent per period, which is why asking it
 * for "the current period" handed the rider back their own checkout receipt.
 * Resolving that is billing.service.ts's job now (resolveInvoiceablePeriod →
 * advanceToNextPeriod), and it creates the next period as `scheduled` up
 * front, because the invoice being previewed has to hang off a real row.
 *
 * Which leaves this question. A `scheduled` row is created BEFORE any money
 * moves, so its existence proves nothing: a rider who opened Review & Renew
 * and closed the app leaves one behind. Treating it as a renewal would tell
 * that rider their renewal was already scheduled (and then refuse to let them
 * renew, since requestEarlyRecharge rejects a subscription that has one), and
 * would have the overdue sweep promote the period for free.
 *
 * So everything that READS a scheduled period asks this module whether its
 * invoice has been paid: loadBookingContext (the rider's booking view),
 * periodsFor (the rider's rental view), and the admin console's
 * "renewal scheduled" filter. payment-overdue-sweep runs the same check
 * inline — it is an Edge Function and cannot import this.
 */

export interface PeriodRow {
    id: string;
    sequence_number: number;
    starts_on: string;
    ends_on: string;
    due_on: string;
    status: "scheduled" | "current" | "closed";
}

/**
 * Of these periods, which have been PAID for.
 *
 * Batched (two queries for any number of periods) because every caller is
 * either a list endpoint or a page view assembling a whole page at once.
 */
export async function paidPeriodIds(periodIds: string[]): Promise<Set<string>> {
    const paid = new Set<string>();
    if (periodIds.length === 0) return paid;

    const { data: invoices, error } = await supabaseAdmin
        .from("invoices")
        .select("id, subscription_period_id")
        .in("subscription_period_id", periodIds)
        .neq("status", "void");
    if (error) throw error;
    if ((invoices ?? []).length === 0) return paid;

    const { data: balances, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("invoice_id, is_paid")
        .in("invoice_id", (invoices ?? []).map((i) => i.id));
    if (balanceError) throw balanceError;

    const paidInvoices = new Set(
        (balances ?? []).filter((b) => b.is_paid).map((b) => b.invoice_id),
    );
    for (const invoice of invoices ?? []) {
        if (invoice.subscription_period_id && paidInvoices.has(invoice.id)) {
            paid.add(invoice.subscription_period_id);
        }
    }
    return paid;
}

/** True when this period's own invoice is fully settled. */
export async function isPeriodPaid(periodId: string): Promise<boolean> {
    return (await paidPeriodIds([periodId])).has(periodId);
}
