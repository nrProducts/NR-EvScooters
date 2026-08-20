import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
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
    subscriptions(id, plans(id, name)),
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
    invoice_items: RawInvoiceItem[] | null;
    payment_allocations: RawAllocation[] | null;
}

interface RawInvoiceDetailRow extends RawInvoiceRow {
    subscriptions: unknown;
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

    const { error: refundError } = await supabaseAdmin.from("refunds").insert({
        user_id: order.user_id,
        payment_transaction_id: allocation.payment_transaction_id,
        amount: Number(balance.allocated_amount ?? allocation.amount),
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
