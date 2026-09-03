import { supabaseAdmin } from "../../config/supabase";
import { businessToday } from "../../common/dates";
import { computeLateRenewalFee, lateFeeReferenceDate } from "../payments/renewalFee";

/**
 * The gate between an overdue rider and "Return Scooter".
 *
 * A rider who has stopped paying (their current period's due_on has passed,
 * unpaid) but wants to hand the scooter back rather than renew still owes
 * the same RENEWAL late fee `computeLateRenewalFee` already charges a rider
 * who renews late — see apps/backend/src/modules/payments/renewalFee.ts. The
 * return flow must collect it before the rental can close, or a rider could
 * dodge the fee entirely just by returning instead of renewing.
 *
 * This is deliberately a SEPARATE debt from the return-lateness fee
 * (return_recovery_settings.late_fee_per_day, computeLateReturnPenalty in
 * rentals.service.ts) — that one is about the scooter itself coming back
 * late once a return has been requested; this one is about the plan having
 * lapsed before a return was ever requested at all. A rider can owe either,
 * both, or neither.
 *
 * The charge is collected through a standalone `invoices` row, purpose
 * 'adhoc' — the one enum value nothing else in the codebase produces (see
 * the check constraints on `invoices`: 'subscription_period' requires a
 * period id, 'settlement' requires a rental id, so 'adhoc' is the only
 * purpose that can stand alone with neither). That lets it flow through the
 * EXISTING payment pipeline unchanged — createOrderForInvoice /
 * openRazorpayCheckout / verifyPayment / applyPaymentSuccess already handles
 * 'adhoc' as "the allocation is the whole effect" (see the comment at that
 * exact line in payments.service.ts) — no period gets advanced, no
 * subscription gets activated, just money recorded against an invoice.
 */

export interface OverdueLateFeePreview {
    isLate: boolean;
    daysLate: number;
    feePerDay: number;
    lateFee: number;
    dueOn: string | null;
}

/** Pure read — computes nothing into existence. Safe to call on every screen load. */
export async function previewOverdueLateFee(subscriptionId: string): Promise<OverdueLateFeePreview> {
    const { data: period, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("due_on")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (error) throw error;
    if (!period) return { isLate: false, daysLate: 0, feePerDay: 0, lateFee: 0, dueOn: null };

    const referenceDate = await lateFeeReferenceDate(subscriptionId, null, period.due_on);
    if (!referenceDate) return { isLate: false, daysLate: 0, feePerDay: 0, lateFee: 0, dueOn: period.due_on };

    const { isLate, daysLate, feePerDay, lateFee } = await computeLateRenewalFee(subscriptionId, referenceDate);
    return { isLate, daysLate, feePerDay, lateFee, dueOn: period.due_on };
}

/**
 * The window an overdue-late-fee invoice must fall within to count as
 * "for this cycle" — the current period's own creation time. A rider who
 * paid off an EARLIER overdue period, then went overdue again on a LATER
 * one after renewing, must not have that stale paid invoice silently cover
 * the new debt.
 */
async function currentPeriodWindow(subscriptionId: string): Promise<{ id: string; createdAt: string } | null> {
    const { data, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, created_at")
        .eq("subscription_id", subscriptionId)
        .eq("status", "current")
        .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, createdAt: data.created_at } : null;
}

async function findAdhocInvoice(
    subscriptionId: string,
    sinceIso: string,
): Promise<{ id: string; total_amount: number } | null> {
    const { data, error } = await supabaseAdmin
        .from("invoices")
        .select("id, total_amount")
        .eq("subscription_id", subscriptionId)
        .eq("purpose", "adhoc")
        .neq("status", "void")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    return data;
}

/**
 * `trg_allocate_invoice_number()` matches `invoice_series.code` EXACTLY —
 * there is no fallback and no fuzzy prefix match — and the code is fiscal-
 * year-suffixed (currently "SNG-FY2627", not the plain "SNG" it looks like
 * at a glance). Hardcoding a literal here would work only until the series
 * rolls over to a new fiscal year and then fail outright, so this looks up
 * whichever series is actually active instead.
 */
export async function activeInvoiceSeriesCode(): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("invoice_series")
        .select("code")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("No active invoice series is configured.");
    return data.code;
}

async function isInvoicePaid(invoiceId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("is_paid")
        .eq("invoice_id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    return data?.is_paid === true;
}

/**
 * Whether the return flow is clear to proceed: either nothing is owed, or
 * it already has been paid. Once paid, stays satisfied for this cycle
 * regardless of how many more days pass before the rider actually returns —
 * matching the same "don't ask again" rule the return-lateness fee already
 * follows once a settlement exists.
 */
export async function isOverdueLateFeeSettled(subscriptionId: string): Promise<boolean> {
    const preview = await previewOverdueLateFee(subscriptionId);
    if (!preview.isLate || preview.lateFee <= 0) return true;

    const window = await currentPeriodWindow(subscriptionId);
    if (!window) return true; // No current period at all — nothing to be overdue against.

    const invoice = await findAdhocInvoice(subscriptionId, window.createdAt);
    if (!invoice) return false;
    return isInvoicePaid(invoice.id);
}

/**
 * Batch version of previewOverdueLateFee + isOverdueLateFeeSettled, for the
 * admin Returns list (spec: "Admin should be able to see ... Overdue days,
 * late fee amount, late fee status"). Sequential per subscription rather
 * than a single joined query — this fleet's rental volume is small enough
 * that the simplicity is worth more than the round trips, same tradeoff
 * `periodsFor` already makes for period dates on the same list.
 */
export async function overdueLateFeeStatusFor(
    subscriptionIds: string[],
): Promise<Map<string, OverdueLateFeePreview & { isSettled: boolean }>> {
    const map = new Map<string, OverdueLateFeePreview & { isSettled: boolean }>();
    for (const id of new Set(subscriptionIds)) {
        const [preview, isSettled] = await Promise.all([previewOverdueLateFee(id), isOverdueLateFeeSettled(id)]);
        map.set(id, { ...preview, isSettled });
    }
    return map;
}

export interface OverdueLateFeeInvoiceResult {
    invoiceId: string;
    amount: number;
    isPaid: boolean;
}

/**
 * The one wording for this charge, so the invoice header, its single line
 * item and every re-price after it read identically. The day count is IN the
 * text, which is exactly why the text has to be rewritten whenever the fee is
 * re-priced — a description frozen at "1 day" on an invoice now worth two
 * days' fee is how a rider ends up reading two different numbers for the same
 * debt on two different screens.
 */
export function overdueLateFeeDescription(daysLate: number, feePerDay: number): string {
    return `Overdue plan renewal — late fee (${daysLate} day${daysLate > 1 ? "s" : ""} @ ₹${feePerDay}/day)`;
}

/**
 * Brings an already-open adhoc invoice up to TODAY's fee.
 *
 * The fee is a per-day rate that keeps growing while the rider stays overdue
 * (computeLateRenewalFee recomputes it on every call), but the invoice minted
 * on the first overdue day was a frozen row: nothing re-priced it, and
 * computeInvoiceLateFee deliberately returns nothing for a non-period
 * purpose, so neither the rider's invoice list nor createOrderForInvoice ever
 * topped it up. A rider who opened Return on day 1 and paid on day 5 was
 * billed day 1's amount — the same defect as audit finding H3, one level
 * down: H3 fixed the stale ORDER, this fixes the stale INVOICE behind it.
 * docs/payment/08-idempotency-design.md states the rule outright: "the rider
 * must be charged today's amount".
 *
 * Never lowers the bill below what has already been allocated to it (a
 * part-paid invoice), and never touches a paid one — once settled the debt is
 * closed for this cycle however many more days pass, matching
 * isOverdueLateFeeSettled.
 */
async function repriceOverdueLateFeeInvoice(
    invoice: { id: string; total_amount: number },
    preview: OverdueLateFeePreview,
): Promise<number> {
    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("allocated_amount, is_paid")
        .eq("invoice_id", invoice.id)
        .maybeSingle();
    if (balanceError) throw balanceError;
    if (balance?.is_paid) return Number(invoice.total_amount);

    const allocated = Number(balance?.allocated_amount ?? 0);
    const amount = Math.max(preview.lateFee, allocated);
    if (amount === Number(invoice.total_amount)) return amount;

    // chk_invoices_total forces total_amount = subtotal_amount, so both move
    // together or neither does.
    const { error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .update({ subtotal_amount: amount, total_amount: amount })
        .eq("id", invoice.id);
    if (invoiceError) throw invoiceError;

    // The invoice carries exactly one line (ensureOverdueLateFeeInvoice writes
    // it), so this rewrites the charge rather than appending a second one —
    // chk_invoice_items_amount needs unit_amount and amount to agree at
    // quantity 1.
    const { error: itemError } = await supabaseAdmin
        .from("invoice_items")
        .update({
            description: overdueLateFeeDescription(preview.daysLate, preview.feePerDay),
            unit_amount: amount,
            amount,
        })
        .eq("invoice_id", invoice.id)
        .eq("item_type", "adjustment");
    if (itemError) throw itemError;

    return amount;
}

/**
 * Cancels an open (unpaid) overdue-late-fee invoice, because the debt behind
 * it has just been collected somewhere else.
 *
 * The adhoc invoice and a late RENEWAL bill the SAME days at the SAME rate —
 * that is the whole point of lateFeeAlreadyCharged, which nets a PAID adhoc
 * off the renewal. The reverse direction had nothing: renew first and the
 * renewal's own recordLateFeeCharge collects the fee, while the adhoc invoice
 * raised earlier (by opening the Return sheet) keeps standing on the rider's
 * bill demanding the identical amount a second time.
 *
 * It went unnoticed because the Billing screen refused to offer a renewal at
 * all while any invoice was outstanding — so "renew while an adhoc is open"
 * was unreachable. Now that it is reachable, this is what stops it double
 * charging.
 *
 * Only ever voids an invoice with NOTHING allocated to it:
 * assert_invoice_void_unallocated enforces that in the database anyway, and
 * money that did arrive is a real payment that must be reconciled, not erased.
 */
async function voidOpenOverdueLateFeeInvoice(subscriptionId: string): Promise<void> {
    const window = await currentPeriodWindow(subscriptionId);
    const existing = await findAdhocInvoice(subscriptionId, window?.createdAt ?? "1970-01-01");
    if (!existing) return;

    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("allocated_amount")
        .eq("invoice_id", existing.id)
        .maybeSingle();
    if (balanceError) throw balanceError;
    if (Number(balance?.allocated_amount ?? 0) > 0) return;

    // chk_invoices_void requires both fields whenever status is 'void'.
    const { error } = await supabaseAdmin
        .from("invoices")
        .update({
            status: "void",
            voided_at: new Date().toISOString(),
            void_reason: "Late fee collected on the plan renewal instead.",
        })
        .eq("id", existing.id)
        .neq("status", "void");
    if (error) throw error;
}

/**
 * Re-prices the rider's own open overdue-late-fee invoice, if they have one.
 *
 * Deliberately callable from a READ path (the rider's invoice list): the
 * alternative is a bill that quotes yesterday's total until the rider happens
 * to open the Return sheet, which is the exact inconsistency this exists to
 * remove. Idempotent, touches only this rider's own unpaid adhoc invoice, and
 * is a no-op the moment nothing is overdue.
 */
export async function syncOverdueLateFeeInvoiceForUser(userId: string): Promise<void> {
    const { data: rental, error } = await supabaseAdmin
        .from("rentals")
        .select("subscription_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("picked_up_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!rental?.subscription_id) return;

    const preview = await previewOverdueLateFee(rental.subscription_id);
    // Nothing owed any more — the rider renewed, or the fee was switched off.
    // An invoice still sitting there is a bill for a debt that no longer
    // exists, so it is cancelled rather than left to be paid.
    if (!preview.isLate || preview.lateFee <= 0) {
        await voidOpenOverdueLateFeeInvoice(rental.subscription_id);
        return;
    }

    const window = await currentPeriodWindow(rental.subscription_id);
    if (!window) return;

    const existing = await findAdhocInvoice(rental.subscription_id, window.createdAt);
    if (!existing) return;

    await repriceOverdueLateFeeInvoice(existing, preview);
}

/**
 * Idempotent: repeated calls while nothing has changed return the SAME
 * invoice rather than minting a new charge every time the rider opens the
 * Return screen. Only creates a fresh one when no open invoice exists for
 * this period's overdue cycle.
 *
 * "Nothing has changed" excludes the passage of time: an existing UNPAID
 * invoice is re-priced to today's fee before it is handed back, so the amount
 * the rider is shown, the order created from it and the row itself can never
 * disagree. See repriceOverdueLateFeeInvoice.
 */
export async function ensureOverdueLateFeeInvoice(
    subscriptionId: string,
    userId: string,
): Promise<OverdueLateFeeInvoiceResult> {
    const preview = await previewOverdueLateFee(subscriptionId);
    if (!preview.isLate || preview.lateFee <= 0) {
        throw new Error(`ensureOverdueLateFeeInvoice: subscription ${subscriptionId} has no late fee due.`);
    }

    const window = await currentPeriodWindow(subscriptionId);
    if (!window) {
        throw new Error(`ensureOverdueLateFeeInvoice: subscription ${subscriptionId} has no current period.`);
    }

    const existing = await findAdhocInvoice(subscriptionId, window.createdAt);
    if (existing) {
        const isPaid = await isInvoicePaid(existing.id);
        const amount = isPaid
            ? Number(existing.total_amount)
            : await repriceOverdueLateFeeInvoice(existing, preview);
        return { invoiceId: existing.id, amount, isPaid };
    }

    const today = businessToday();
    const seriesCode = await activeInvoiceSeriesCode();
    const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .insert({
            user_id: userId,
            subscription_id: subscriptionId,
            purpose: "adhoc",
            status: "issued",
            subtotal_amount: preview.lateFee,
            total_amount: preview.lateFee,
            issued_on: today,
            due_on: today,
            invoice_series_code: seriesCode,
            invoice_number: "",
        })
        .select("id")
        .single();
    if (invoiceError) throw invoiceError;

    const { error: itemError } = await supabaseAdmin.from("invoice_items").insert({
        invoice_id: invoice.id,
        item_type: "adjustment",
        description: overdueLateFeeDescription(preview.daysLate, preview.feePerDay),
        line_number: 1,
        quantity: 1,
        unit_amount: preview.lateFee,
        amount: preview.lateFee,
    });
    if (itemError) throw itemError;

    return { invoiceId: invoice.id, amount: preview.lateFee, isPaid: false };
}
