import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import { InvoiceDetail, InvoiceRow, ListInvoicesFilters } from "./invoices.types";

const LIST_COLUMNS = `
    id, user_id, subscription_id, rental_id, booking_id, payment_type, status, amount_due, due_date,
    payment_status, payment_method, gateway_ref, paid_at, created_at, updated_at,
    users(id, full_name, email)
`;

const DETAIL_COLUMNS = `
    ${LIST_COLUMNS},
    subscriptions(id, plans(id, name)),
    rentals(id, vehicles(id, name, registration_number))
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawInvoiceRow {
    id: string;
    user_id: string;
    subscription_id: string | null;
    rental_id: string | null;
    booking_id: string | null;
    payment_type: InvoiceRow["payment_type"];
    status: InvoiceRow["status"];
    amount_due: number | string;
    due_date: string;
    payment_status: InvoiceRow["payment_status"];
    payment_method: InvoiceRow["payment_method"];
    gateway_ref: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string | null;
    users: unknown;
}

interface RawInvoiceDetailRow extends RawInvoiceRow {
    subscriptions: unknown;
    rentals: unknown;
}

/** Postgres `numeric` columns (amount_due) round-trip through PostgREST as strings. */
function toInvoiceRow(row: RawInvoiceRow): InvoiceRow {
    return {
        id: row.id,
        user_id: row.user_id,
        subscription_id: row.subscription_id,
        rental_id: row.rental_id,
        booking_id: row.booking_id,
        payment_type: row.payment_type,
        status: row.status,
        amount_due: Number(row.amount_due),
        due_date: row.due_date,
        payment_status: row.payment_status,
        payment_method: row.payment_method,
        gateway_ref: row.gateway_ref,
        paid_at: row.paid_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        rider: unwrap(row.users),
    };
}

function toInvoiceDetail(row: RawInvoiceDetailRow): InvoiceDetail {
    const subscription = unwrap<{ id: string; plans: unknown }>(row.subscriptions);
    const rental = unwrap<{ id: string; vehicles: unknown }>(row.rentals);
    return {
        ...toInvoiceRow(row),
        plan: subscription ? unwrap(subscription.plans) : null,
        vehicle: rental ? unwrap(rental.vehicles) : null,
    };
}

export async function listInvoices(filters: ListInvoicesFilters): Promise<Paginated<InvoiceRow>> {
    let query = supabaseAdmin.from("invoices").select(LIST_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.paymentStatus) query = query.eq("payment_status", filters.paymentStatus);
    if (filters.paymentType) query = query.eq("payment_type", filters.paymentType);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

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
 * Bookkeeping-only refund: there is no payment gateway integration in this
 * codebase (invoices are settled by whatever mints `gateway_ref` upstream, not
 * by anything here), so this just flips the internal record — it does not
 * call out to Razorpay/Stripe/etc. to actually move money. Only a
 * successfully-paid invoice can be refunded.
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
    if (before.payment_status !== "succeeded") {
        throw businessRule("Only a successfully paid invoice can be refunded.");
    }

    const { data, error } = await supabaseAdmin
        .from("invoices")
        .update({ payment_status: "refunded" })
        .eq("id", id)
        .select(LIST_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Invoice not found.");

    const invoice = toInvoiceRow(data as unknown as RawInvoiceRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: invoice.user_id,
        action: "invoice.refunded",
        entityType: "invoice",
        entityId: invoice.id,
        before: { payment_status: before.payment_status },
        after: { payment_status: invoice.payment_status, reason: reason ?? null },
    });

    return invoice;
}
