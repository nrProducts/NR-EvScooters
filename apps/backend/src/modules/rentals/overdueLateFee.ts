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
async function activeInvoiceSeriesCode(): Promise<string> {
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
 * Idempotent: repeated calls while nothing has changed return the SAME
 * invoice rather than minting a new charge every time the rider opens the
 * Return screen. Only creates a fresh one when no open invoice exists for
 * this period's overdue cycle.
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
        return { invoiceId: existing.id, amount: Number(existing.total_amount), isPaid };
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
        description: `Overdue plan renewal — late fee (${preview.daysLate} day${preview.daysLate > 1 ? "s" : ""} @ ₹${preview.feePerDay}/day)`,
        line_number: 1,
        quantity: 1,
        unit_amount: preview.lateFee,
        amount: preview.lateFee,
    });
    if (itemError) throw itemError;

    return { invoiceId: invoice.id, amount: preview.lateFee, isPaid: false };
}
