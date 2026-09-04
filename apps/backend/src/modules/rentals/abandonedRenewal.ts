import { supabaseAdmin } from "../../config/supabase";

/**
 * Clears the renewal bill a rider was left holding for a period they are
 * never going to buy.
 *
 * ── Where the phantom bill comes from ────────────────────────────────────
 *
 * "Review & Renew" (requestEarlyRecharge -> generatePeriodInvoice) mints real
 * rows BEFORE any payment, because an invoice needs a period to attach to:
 * billing.service.ts's advanceToNextPeriod inserts the next period as
 * 'scheduled', and generate_period_invoice() raises its invoice. A rider who
 * opens that preview and backs out leaves both behind — an unpaid
 * 'subscription_period' invoice against a 'scheduled' period.
 *
 * Nothing collected it and nothing cleaned it up, so it sat in the rider's
 * Amount Due with a Pay button, and again in Payment History as "Due". Then
 * they requested a RETURN, and were still being asked to pay ₹1800 to renew a
 * plan on a scooter they were handing back.
 *
 * ── Why voiding is the right verb ────────────────────────────────────────
 *
 * The debt genuinely stops existing: the rider is returning, so no period is
 * being bought, so there is nothing to owe. Voiding says that once, in the
 * database, so the app, the admin console and revenue reporting all agree —
 * as opposed to hiding the row in the app and leaving admin chasing a payment
 * that will never come. Same reasoning and the same shape as
 * voidOpenOverdueLateFeeInvoice in overdueLateFee.ts.
 *
 * ── The two things that make it safe ─────────────────────────────────────
 *
 * ONLY an invoice with nothing allocated to it. assert_invoice_void_unallocated
 * enforces that in the database anyway; money that did arrive is a real
 * payment to be reconciled, never erased.
 *
 * ONLY a period after the first, and only one nobody has paid for — see
 * unboughtPeriodFor for why that is the line, and why 'current' has to be in
 * scope rather than 'scheduled' alone.
 *
 * The period ROW is deliberately left in place: period_status has no
 * 'cancelled' value and the voided invoice still references it. A 'scheduled'
 * one is inert once its invoice is void (the sweep only promotes a period
 * whose invoice is settled — once its deployed build catches up with the
 * repo). A 'current' one keeps the rider's plan dates coherent until the
 * return completes and the subscription ends.
 */

/**
 * The period a preview created but no payment ever bought.
 *
 * NOT just 'scheduled'. That was the first version of this, and it missed the
 * case that actually happens in production: the deployed payment-overdue-sweep
 * PROMOTES an unpaid scheduled period to 'current' (its is_paid guard exists
 * in supabase/functions/payment-overdue-sweep/index.ts but the deployed build
 * predates it), so by the time a rider gets round to returning, the abandoned
 * preview is sitting there as their 'current' period with an unpaid invoice.
 * Looking only at 'scheduled' found nothing and the phantom bill survived.
 *
 * `sequence_number > 1` is the guard that keeps this off a genuine debt. Under
 * billed-in-advance every period is paid for before it starts, so an unpaid
 * period after the first was never bought — and the rider's actual USE of the
 * days past their last paid period is charged separately, by the overdue late
 * fee at ₹/day (overdueLateFee.ts). Billing both would charge Sep 3–9 as a
 * full period AND Sep 2–4 as late-fee days. Period 1 is excluded because it is
 * the opening invoice from checkout, which is a real debt if it is unpaid.
 */
async function unboughtPeriodFor(subscriptionId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("id")
        .eq("subscription_id", subscriptionId)
        .in("status", ["scheduled", "current"])
        .gt("sequence_number", 1)
        .order("sequence_number", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data?.id ?? null;
}

export interface VoidedRenewal {
    invoiceId: string;
    amount: number;
}

/**
 * Returns what was voided, or null when there was nothing to void — no
 * scheduled period, no invoice on it, already void, or money already against
 * it. Safe to call unconditionally; safe to call twice.
 */
export async function voidAbandonedRenewalInvoice(
    subscriptionId: string,
    reason = "Return requested — the next plan period was never bought.",
): Promise<VoidedRenewal | null> {
    const periodId = await unboughtPeriodFor(subscriptionId);
    if (!periodId) return null;

    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, total_amount")
        .eq("subscription_period_id", periodId)
        .eq("purpose", "subscription_period")
        .neq("status", "void")
        .maybeSingle();
    if (error) throw error;
    if (!invoice) return null;

    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("allocated_amount")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
    if (balanceError) throw balanceError;
    // Part-paid or paid: real money arrived against this bill. Voiding it
    // would erase a payment, so it stays and the settlement deals with it.
    if (Number(balance?.allocated_amount ?? 0) > 0) return null;

    // chk_invoices_void requires both fields whenever status is 'void'.
    const { error: voidError } = await supabaseAdmin
        .from("invoices")
        .update({
            status: "void",
            voided_at: new Date().toISOString(),
            void_reason: reason,
        })
        .eq("id", invoice.id)
        .neq("status", "void");
    if (voidError) throw voidError;

    // Back to 'pending', not 'voided'.
    //
    // generate_period_invoice() only picks up adjustments whose status is
    // 'pending', and marks each 'invoiced' as it writes the line. Those
    // markings now point at a void invoice, so a later re-invoice of this
    // same period — the rider's return gets rejected and they renew after all
    // — would produce a bill silently missing its discount or its late fee.
    // Returning them to 'pending' makes them billable again, and
    // apply_period_adjustments' ON CONFLICT (which ignores only 'voided'
    // rows) still refuses to duplicate them.
    const { error: adjustmentError } = await supabaseAdmin
        .from("subscription_adjustments")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("subscription_period_id", periodId)
        .eq("status", "invoiced");
    if (adjustmentError) throw adjustmentError;

    return { invoiceId: invoice.id, amount: Number(invoice.total_amount) };
}

/**
 * Whether this rental has a return the rider has already asked for and staff
 * have not finished — the one condition that makes renewing, booking again
 * and plan-expiry messaging wrong across the whole app.
 *
 * 'requested' and 'inspected' only: a 'rejected' return leaves the rider on
 * their plan exactly as before (they must be able to renew again), and an
 * 'approved' one has already ended the rental.
 */
export async function hasOpenReturn(subscriptionId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("rental_returns")
        .select("id, rentals!inner(subscription_id)")
        .eq("rentals.subscription_id", subscriptionId)
        .in("status", ["requested", "inspected"])
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}

/**
 * The same question keyed on the RIDER rather than one subscription — for
 * paths that hold a user id and no subscription yet, chiefly createBooking's
 * "why can't I book another scooter" message.
 */
export async function hasOpenReturnForUser(userId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("rental_returns")
        .select("id, rentals!inner(user_id, status)")
        .eq("rentals.user_id", userId)
        .eq("rentals.status", "active")
        .in("status", ["requested", "inspected"])
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return !!data;
}
