import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import { notifyUser } from "../notifications/notifications.service";
import { activeInvoiceSeriesCode } from "../rentals/overdueLateFee";
import { recordOfflinePayment, setInvoiceTotal, supersedeOpenOrders } from "../payments/payments.service";
import { OVERDUE_LATE_FEE_LINE_PREFIX } from "../payments/renewalFee";
import { AuthContext, Paginated } from "../../types";
import {
    InvoiceDetail, InvoicePaymentState, InvoiceRow, ListInvoicesFilters,
} from "./invoices.types";

/**
 * ── WHY THESE ARE SINGLE STRING LITERALS ─────────────────────────────────
 *
 * They used to be one constant interpolated into another
 * (`DETAIL_COLUMNS = \`${LIST_COLUMNS}, …\``), and that is what let this
 * module ship asking for eight columns that do not exist. Interpolation
 * widens the template's type from a literal to `string`, and supabase-js can
 * only type-check a select it can read as a literal — so `tsc` passed on a
 * query PostgREST answers with a 400.
 *
 * The duplication below is deliberate and is the cheaper half of that trade:
 * it is what makes a wrong column name a compile error again.
 */
const LIST_COLUMNS = `
    id, user_id, subscription_id, subscription_period_id, rental_id,
    invoice_number, purpose, status, issued_on, due_on,
    subtotal_amount, total_amount, currency, created_at, updated_at,
    users(id, full_name, email),
    subscriptions(cycle_time),
    invoice_items(id, item_type, subscription_adjustment_id, description, quantity, unit_amount, amount, created_at),
    payment_allocations(amount, allocated_at, payment_transactions(method, gateway_payment_id))
` as const;

const DETAIL_COLUMNS = `
    id, user_id, subscription_id, subscription_period_id, rental_id,
    invoice_number, purpose, status, issued_on, due_on,
    subtotal_amount, total_amount, currency, created_at, updated_at,
    users(id, full_name, email),
    invoice_items(id, item_type, subscription_adjustment_id, description, quantity, unit_amount, amount, created_at),
    payment_allocations(amount, allocated_at, payment_transactions(method, gateway_payment_id)),
    subscriptions(id, cycle_time, plans(id, name)),
    rentals(id, rental_vehicle_assignments(vehicle_id, released_at, vehicles(id, display_name, registration_number)))
` as const;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawAllocation {
    amount: number | string;
    allocated_at: string;
    payment_transactions: unknown;
}

interface RawInvoiceItem {
    id: string;
    item_type: InvoiceRow["items"][number]["item_type"];
    subscription_adjustment_id: string | null;
    description: string;
    quantity: number | string;
    unit_amount: number | string;
    amount: number | string;
    created_at: string;
}

interface RawInvoiceRow {
    id: string;
    user_id: string;
    subscription_id: string;
    subscription_period_id: string | null;
    rental_id: string | null;
    invoice_number: string;
    purpose: InvoiceRow["purpose"];
    status: InvoiceRow["status"];
    issued_on: string | null;
    due_on: string | null;
    subtotal_amount: number | string;
    total_amount: number | string;
    currency: string;
    created_at: string;
    updated_at: string | null;
    users: unknown;
    subscriptions: unknown;
    invoice_items: RawInvoiceItem[] | null;
    payment_allocations: RawAllocation[] | null;
}

interface RawInvoiceDetailRow extends RawInvoiceRow {
    rentals: { id: string; rental_vehicle_assignments: unknown } | null;
}

/**
 * Paid-ness, computed rather than read.
 *
 * There is no `payment_status` column and there should not be — it was a flag
 * that could disagree with the money. This derives the same four words from
 * what was actually allocated, which is the only thing that can be true.
 */
function derivePaymentState(
    totalAmount: number,
    allocated: number,
    status: InvoiceRow["status"],
    dueOn: string | null,
): InvoicePaymentState {
    if (allocated >= totalAmount && totalAmount > 0) return "paid";
    if (allocated > 0) return "partial";
    // `business_today()`, not the UTC day — `due_on` is an IST calendar day,
    // and comparing it to a UTC date reports an invoice overdue five and a
    // half hours early.
    if (status === "issued" && dueOn && dueOn < businessToday()) return "overdue";
    return "unpaid";
}

/** Postgres `numeric` round-trips through PostgREST as a string. */
function toInvoiceRow(row: RawInvoiceRow): InvoiceRow {
    const allocations = row.payment_allocations ?? [];
    const allocated = allocations.reduce((sum, a) => sum + Number(a.amount), 0);
    const total = Number(row.total_amount);

    // The allocation that settled it, for the payment metadata the console
    // shows. Latest wins: a part-paid invoice finished by a second payment is
    // described by the second one.
    const latest = allocations
        .slice()
        .sort((a, b) => Date.parse(b.allocated_at) - Date.parse(a.allocated_at))[0];
    const txn = unwrap<{ method: InvoiceRow["payment_method"]; gateway_payment_id: string | null }>(
        latest?.payment_transactions,
    );

    const paymentState = derivePaymentState(total, allocated, row.status, row.due_on);

    return {
        id: row.id,
        user_id: row.user_id,
        subscription_id: row.subscription_id,
        subscription_period_id: row.subscription_period_id,
        rental_id: row.rental_id,
        invoice_number: row.invoice_number,
        purpose: row.purpose,
        status: row.status,
        issued_on: row.issued_on,
        due_on: row.due_on,
        cycle_time: unwrap<{ cycle_time: string | null }>(row.subscriptions)?.cycle_time ?? null,
        subtotal_amount: Number(row.subtotal_amount),
        total_amount: total,
        currency: row.currency,
        created_at: row.created_at,
        updated_at: row.updated_at,

        allocated_amount: Math.round(allocated * 100) / 100,
        balance_amount: Math.round((total - allocated) * 100) / 100,
        payment_state: paymentState,
        paid_at: paymentState === "paid" ? latest?.allocated_at ?? null : null,
        payment_method: txn?.method ?? null,
        gateway_ref: txn?.gateway_payment_id ?? null,

        rider: unwrap(row.users),
        items: (row.invoice_items ?? []).map((item) => ({
            ...item,
            quantity: Number(item.quantity),
            unit_amount: Number(item.unit_amount),
            amount: Number(item.amount),
        })),
    };
}

function toInvoiceDetail(row: RawInvoiceDetailRow): InvoiceDetail {
    const subscription = unwrap<{ id: string; plans: unknown }>(row.subscriptions);

    // `rentals` has NO foreign key to `vehicles` — which scooter a rental
    // holds is the open `rental_vehicle_assignments` row, because one rental
    // can hold several over its life (breakdown → temp scooter → back again).
    // The old `rentals(vehicles(...))` embed was a relationship PostgREST
    // could not follow, so the whole detail query 400'd.
    //
    // The latest assignment is the right one to name here: an invoice is
    // being explained after the fact, so the scooter the rider actually has
    // (or last had) is the answer, not the first one they were given.
    const rental = unwrap<{ id: string; rental_vehicle_assignments: unknown }>(row.rentals);
    const assignments = Array.isArray(rental?.rental_vehicle_assignments)
        ? rental.rental_vehicle_assignments as Array<{ released_at: string | null; vehicles: unknown }>
        : [];
    const current = assignments.find((a) => a.released_at === null) ?? assignments[0];

    return {
        ...toInvoiceRow(row),
        plan: subscription ? unwrap(subscription.plans) : null,
        vehicle: current ? unwrap(current.vehicles) : null,
    };
}

export async function listInvoices(filters: ListInvoicesFilters): Promise<Paginated<InvoiceRow>> {
    let query = supabaseAdmin.from("invoices").select(LIST_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.purpose) query = query.eq("purpose", filters.purpose);
    if (filters.userId) query = query.eq("user_id", filters.userId);

    // Paid-ness is not a column — it is the allocations, summed by
    // v_invoice_balances. So it is resolved to an id list first rather than
    // being expressed as a filter on `invoices`.
    if (filters.paymentState) {
        const balanceQuery = supabaseAdmin.from("v_invoice_balances").select("invoice_id");
        const { data: balances, error: balanceError } = await (
            filters.paymentState === "paid" ? balanceQuery.eq("is_paid", true)
                : filters.paymentState === "overdue" ? balanceQuery.eq("is_overdue", true)
                    : balanceQuery.eq("is_paid", false)
        );
        if (balanceError) throw balanceError;

        let ids = (balances ?? []).flatMap((b) => (b.invoice_id ? [b.invoice_id] : []));

        // `partial` has no flag on the view — it is "unpaid, but something
        // has been allocated", which needs the amounts rather than the
        // booleans.
        if (filters.paymentState === "partial") {
            const { data: partials, error: partialError } = await supabaseAdmin
                .from("v_invoice_balances")
                .select("invoice_id, allocated_amount")
                .eq("is_paid", false)
                .gt("allocated_amount", 0);
            if (partialError) throw partialError;
            ids = (partials ?? []).flatMap((b) => (b.invoice_id ? [b.invoice_id] : []));
        }

        if (ids.length === 0) return paginate([], 0, filters);
        query = query.in("id", ids);
    }

    // `invoices.booking_id` is gone — the invoice belongs to the
    // subscription, which belongs to the booking.
    if (filters.bookingId) {
        const { data: sub, error: subError } = await supabaseAdmin
            .from("subscriptions")
            .select("id")
            .eq("booking_id", filters.bookingId)
            .maybeSingle();
        if (subError) throw subError;
        if (!sub) return paginate([], 0, filters);
        query = query.eq("subscription_id", sub.id);
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return paginate(((data ?? []) as unknown as RawInvoiceRow[]).map(toInvoiceRow), count ?? 0, filters);
}

export interface AddAdhocChargeInput {
    userId: string;
    description: string;
    amount: number;
    /** Record the payment straight away — `paid` settles the charge, otherwise it's left owing. */
    payment?: { method: "upi" | "card" | "netbanking" | "wallet" | "cash"; status: "paid" | "pending" };
}

/**
 * Raises a one-off charge against a rider outside their plan — a lost key, a
 * replacement lock, a cleaning fee, a fine. It's a standalone `adhoc` invoice
 * (the same mechanism the overdue late fee uses), so it flows through every
 * existing surface: the Payments grid, the rider's Outstanding balance, the
 * mobile billing history, and — if it ever needs reversing — the refund flow.
 *
 * `invoices.subscription_id` is NOT NULL, so the rider must have had at least
 * one subscription; the most recent one is used as the anchor.
 */
export async function addAdhocCharge(
    input: AddAdhocChargeInput,
    actor: AuthContext,
): Promise<InvoiceDetail> {
    const amount = Math.round(input.amount * 100) / 100;
    if (!(amount > 0)) throw businessRule("Enter a charge amount greater than zero.");
    const description = input.description.trim();
    if (description.length < 2) throw businessRule("Describe what the charge is for.");

    const { data: rider, error: riderError } = await supabaseAdmin
        .from("users")
        .select("id, role, deleted_at")
        .eq("id", input.userId)
        .maybeSingle();
    if (riderError) throw riderError;
    if (!rider || rider.deleted_at) throw notFound("Rider not found.");
    if (rider.role !== "rider") throw businessRule("Charges can only be added to rider accounts.");

    const { data: sub, error: subError } = await supabaseAdmin
        .from("subscriptions")
        .select("id")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (subError) throw subError;
    if (!sub) throw businessRule("This rider has never had a plan, so a charge can't be attached yet.");

    const today = businessToday();
    const seriesCode = await activeInvoiceSeriesCode();

    const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .insert({
            user_id: input.userId,
            subscription_id: sub.id,
            purpose: "adhoc",
            status: "issued",
            subtotal_amount: amount,
            total_amount: amount,
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
        description,
        line_number: 1,
        quantity: 1,
        unit_amount: amount,
        amount,
    });
    if (itemError) throw itemError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: input.userId,
        action: "invoice.charge_added",
        entityType: "invoice",
        entityId: invoice.id,
        after: { description, amount, paid: input.payment?.status === "paid" },
    });

    if (input.payment?.status === "paid") {
        await recordOfflinePayment(invoice.id, input.payment.method, actor);
    }

    await notifyUser(input.userId, {
        template: "adhoc_charge_added",
        title: "New Charge Added",
        body: input.payment?.status === "paid"
            ? `A charge of ₹${amount} was added and recorded as paid: ${description}.`
            : `A charge of ₹${amount} was added to your account: ${description}.`,
        screen: "billing",
    });

    return getInvoiceById(invoice.id);
}

/**
 * The checks shared by changing an invoice's amount and deleting it: both are
 * "before paid" corrections only. Anything money has touched — an allocation,
 * or a gateway transaction (even a FAILED one: a late UPI success can still
 * land on it, see payments.lateSuccess) — goes through Refunds instead.
 */
async function loadUnpaidInvoiceForEdit(invoiceId: string) {
    const { data: invoice, error } = await supabaseAdmin
        .from("invoices")
        .select("id, user_id, invoice_number, purpose, status, total_amount, invoice_items(id, line_number, item_type, subscription_adjustment_id, description, amount)")
        .eq("id", invoiceId)
        .maybeSingle();
    if (error) throw error;
    if (!invoice) throw notFound("Invoice not found.");
    if (invoice.status === "void") throw businessRule("This invoice is void.");

    const items = invoice.invoice_items ?? [];

    // The overdue late fee re-prices itself every day (syncOverdueLateFeeInvoiceForUser),
    // so an edit would be silently overwritten and a delete re-created the next
    // time the rider opens Billing. Late fees are managed from Returns / plan settings.
    if (invoice.purpose === "adhoc"
        && items.some((i) => i.line_number === 1 && i.description.startsWith(OVERDUE_LATE_FEE_LINE_PREFIX))) {
        throw businessRule("The overdue late fee is calculated automatically and can't be edited or deleted here.");
    }

    const { count: allocations, error: allocError } = await supabaseAdmin
        .from("payment_allocations")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoiceId);
    if (allocError) throw allocError;
    if ((allocations ?? 0) > 0) {
        throw businessRule("A payment has already been recorded against this invoice. Use Refund instead.");
    }

    const { data: orders, error: orderError } = await supabaseAdmin
        .from("payment_orders")
        .select("id, payment_transactions(id)")
        .eq("invoice_id", invoiceId);
    if (orderError) throw orderError;
    if ((orders ?? []).some((o) => (o.payment_transactions ?? []).length > 0)) {
        throw businessRule(
            "The rider has attempted an online payment on this invoice, so it can't be changed. Check Payment Recovery first.",
        );
    }

    const { count: redemptions, error: redemptionError } = await supabaseAdmin
        .from("referral_card_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("invoice_id", invoiceId);
    if (redemptionError) throw redemptionError;

    return { invoice, items, orderIds: (orders ?? []).map((o) => o.id), hasReferralCard: (redemptions ?? 0) > 0 };
}

/**
 * Changes what an unpaid invoice asks for.
 *
 * A one-off charge (a single line not tied to a pricing rule) has that line
 * re-priced in place, so the rider reads "Fine ₹500", not "Fine ₹1,000 /
 * Admin adjustment −₹500". Anything else — a plan fee with its rule-driven
 * adjustments and deposit — gets one "Admin adjustment" line for the
 * difference (setInvoiceTotal), so every line the system generated stays
 * truthful and the lines still sum to the total.
 *
 * Open Razorpay orders at the old amount are expired so a checkout sheet the
 * rider already has open can't collect the old price.
 */
export async function changeInvoiceAmount(
    invoiceId: string,
    newAmount: number,
    reason: string | undefined,
    actor: AuthContext,
): Promise<InvoiceDetail> {
    const amount = Math.round(newAmount * 100) / 100;
    if (!(amount > 0)) throw businessRule("Enter an amount greater than zero. To remove the invoice, delete it instead.");

    const { invoice, items } = await loadUnpaidInvoiceForEdit(invoiceId);
    const oldAmount = Number(invoice.total_amount);
    if (Math.abs(oldAmount - amount) < 0.01) return getInvoiceById(invoiceId);

    const single = items.length === 1 ? items[0] : null;
    if (single && single.item_type === "adjustment" && !single.subscription_adjustment_id) {
        const { error: itemError } = await supabaseAdmin
            .from("invoice_items")
            .update({ unit_amount: amount, amount, quantity: 1 })
            .eq("id", single.id);
        if (itemError) throw itemError;

        const { error: totalError } = await supabaseAdmin
            .from("invoices")
            .update({ subtotal_amount: amount, total_amount: amount, updated_at: new Date().toISOString() })
            .eq("id", invoiceId);
        if (totalError) throw totalError;
    } else {
        await setInvoiceTotal(invoiceId, amount, actor);
    }

    await supersedeOpenOrders(invoiceId, amount);

    await writeAudit({
        actorId: actor.id,
        targetUserId: invoice.user_id,
        action: "invoice.amount_changed",
        entityType: "invoice",
        entityId: invoiceId,
        before: { total_amount: oldAmount },
        after: { total_amount: amount, reason: reason ?? null },
    });

    return getInvoiceById(invoiceId);
}

/**
 * Permanently deletes an unpaid invoice (the operator's explicit choice over
 * voiding — see the Payments screen). This leaves a gap in the invoice
 * series; the audit row is the only record of the number and why it went.
 *
 *  - unpaid gateway orders are removed first (payment_orders is ON DELETE RESTRICT);
 *  - a return settlement pointing at it is unlinked;
 *  - pricing-rule adjustments billed on it are voided, so they don't resurface;
 *  - its invoice_items go with it (ON DELETE CASCADE).
 *
 * A deleted plan-renewal or first-payment invoice is raised again by the
 * normal billing flow the next time that period is billed.
 */
export async function deleteInvoice(
    invoiceId: string,
    reason: string | undefined,
    actor: AuthContext,
): Promise<void> {
    const { invoice, items, orderIds, hasReferralCard } = await loadUnpaidInvoiceForEdit(invoiceId);
    if (hasReferralCard) {
        throw businessRule("A referral reward card is applied to this invoice. Release the card before deleting it.");
    }

    if (orderIds.length > 0) {
        const { error } = await supabaseAdmin.from("payment_orders").delete().in("id", orderIds);
        if (error) throw error;
    }

    const { error: returnError } = await supabaseAdmin
        .from("rental_returns")
        .update({ additional_due_invoice_id: null })
        .eq("additional_due_invoice_id", invoiceId);
    if (returnError) throw returnError;

    const adjustmentIds = items.flatMap((i) => (i.subscription_adjustment_id ? [i.subscription_adjustment_id] : []));
    if (adjustmentIds.length > 0) {
        const { error } = await supabaseAdmin
            .from("subscription_adjustments")
            .update({
                status: "voided",
                voided_at: new Date().toISOString(),
                voided_by_user_id: actor.id,
                void_reason: `Invoice ${invoice.invoice_number} deleted by admin.`,
            })
            .in("id", adjustmentIds);
        if (error) throw error;
    }

    const { error: deleteError } = await supabaseAdmin.from("invoices").delete().eq("id", invoiceId);
    if (deleteError) throw deleteError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: invoice.user_id,
        action: "invoice.deleted",
        entityType: "invoice",
        entityId: invoiceId,
        before: {
            invoice_number: invoice.invoice_number,
            purpose: invoice.purpose,
            total_amount: Number(invoice.total_amount),
            items: items.map((i) => ({ description: i.description, amount: Number(i.amount) })),
        },
        after: { reason: reason ?? null },
    });
}

export async function getInvoiceById(id: string): Promise<InvoiceDetail> {
    const { data, error } = await supabaseAdmin
        .from("invoices")
        .select(DETAIL_COLUMNS)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Invoice not found.");

    return toInvoiceDetail(data as unknown as RawInvoiceDetailRow);
}

/**
 * Refunds an invoice.
 *
 * This used to be bookkeeping only — it flipped `invoices.payment_status` to
 * `refunded` and moved no money. That column is gone, and rightly: an invoice
 * is a bill, and a bill is not un-issued by money coming back. A refund is its
 * own row against the payment it reverses.
 *
 * So this now creates a real refund through refunds.service.ts, which is also
 * what makes the admin action honest — the button said "refund" and did not
 * refund anything.
 */
export async function refundInvoice(
    id: string,
    reason: string | undefined,
    actor: AuthContext,
): Promise<InvoiceRow> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("invoices")
        .select(LIST_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Invoice not found.");

    const before = toInvoiceRow(existing as unknown as RawInvoiceRow);

    const { data: balance, error: balanceError } = await supabaseAdmin
        .from("v_invoice_balances")
        .select("is_paid, allocated_amount")
        .eq("invoice_id", id)
        .maybeSingle();
    if (balanceError) throw balanceError;
    if (!balance?.is_paid) {
        throw businessRule("Only a successfully paid invoice can be refunded.");
    }

    const { data: allocation, error: allocationError } = await supabaseAdmin
        .from("payment_allocations")
        .select("amount, payment_transaction_id, payment_transactions(payment_orders(user_id))")
        .eq("invoice_id", id)
        .order("allocated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (allocationError) throw allocationError;
    if (!allocation) throw businessRule("No payment is recorded against this invoice.");

    const txn = unwrap<{ payment_orders: unknown }>(allocation.payment_transactions);
    const order = unwrap<{ user_id: string }>(txn?.payment_orders);
    if (!order) throw businessRule("The payment against this invoice has no payer on record.");

    const goodwillAmount = Number(balance.allocated_amount ?? allocation.amount);
    const { error: refundError } = await supabaseAdmin.from("refunds").insert({
        user_id: order.user_id,
        payment_transaction_id: allocation.payment_transaction_id,
        amount: goodwillAmount,
        gross_amount: goodwillAmount,
        // Staff refunding a settled bill outright is a discretionary act;
        // `goodwill` is the reason the enum has for exactly that.
        reason: "goodwill",
        status: "pending",
    });
    if (refundError) throw refundError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: before.user_id,
        action: "invoice.refunded",
        entityType: "invoice",
        entityId: before.id,
        before: { payment_state: before.payment_state },
        after: { refund_reason: reason ?? "goodwill", amount: before.allocated_amount },
    });

    return before;
}
