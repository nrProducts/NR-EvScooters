import type { Database } from "../../types/database.types";

/** Same local alias the rest of the codebase uses — see types/index.ts. */
type Enums = Database["public"]["Enums"];

/**
 * Invoices.
 *
 * This file described the OLD `invoices` table until the final system audit
 * found it: the module's filters, refund path and `purpose` mapping had been
 * migrated, but its select strings, row types and wire contract had not. The
 * listing therefore asked PostgREST for `booking_id`, `payment_type`,
 * `amount_due`, `due_date`, `payment_status`, `payment_method`, `gateway_ref`
 * and `paid_at` — none of which exist — and every GET /invoices returned a
 * 400.
 *
 * It survived a clean `tsc` because a select STRING is only checked when
 * supabase-js can parse it, and `DETAIL_COLUMNS` was built by interpolating
 * `LIST_COLUMNS`, which erases the literal type the checker needs. Two
 * modules were wrong for that reason; see the note in audit.service.ts.
 *
 * ── What the columns became ──────────────────────────────────────────────
 *
 *   booking_id      → gone. The invoice belongs to the SUBSCRIPTION, which
 *                     belongs to the booking. One hop, no duplicated key.
 *   payment_type    → `purpose`, and a different vocabulary: an invoice is
 *                     raised for a reason (initial / subscription_period /
 *                     settlement / adhoc), not for a payment kind.
 *   amount_due      → `subtotal_amount` + `total_amount`.
 *   due_date        → `due_on` (a date, meaning an IST calendar day).
 *   payment_status  → DELETED ON PURPOSE. Paid-ness is derived from money
 *                     actually allocated — see `v_invoice_balances` — rather
 *                     than a flag someone has to remember to set.
 *   payment_method  → `payment_transactions.method`, reached through the
 *   gateway_ref     → allocation. They describe the PAYMENT, not the bill.
 *   paid_at         →
 */

export type InvoiceStatus = Enums["invoice_status"];
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ["draft", "issued", "void"] as const;

/** Why the invoice exists. Was the free-er `payment_type`. */
export type InvoicePurpose = Enums["invoice_purpose"];
export const INVOICE_PURPOSES: readonly InvoicePurpose[] = [
    "initial", "subscription_period", "settlement", "adhoc",
] as const;

export type PaymentMethod = Enums["payment_method"];

/**
 * Paid-ness, DERIVED from `v_invoice_balances` rather than stored.
 *
 * Kept as a single word because both clients filter and badge on one, but it
 * is computed here and has no column behind it:
 *
 *   paid     allocated >= total
 *   partial  0 < allocated < total
 *   overdue  unpaid, issued, and `due_on` is past
 *   unpaid   anything else
 */
export type InvoicePaymentState = "paid" | "partial" | "overdue" | "unpaid";
export const INVOICE_PAYMENT_STATES: readonly InvoicePaymentState[] = [
    "paid", "partial", "overdue", "unpaid",
] as const;

/** A single line on an invoice. */
export interface InvoiceItemRow {
    id: string;
    item_type: Enums["invoice_item_type"];
    /** `subscription_adjustment_id` — the charge or discount this line materialises. */
    subscription_adjustment_id: string | null;
    /** Was `label`. */
    description: string;
    quantity: number;
    unit_amount: number;
    amount: number;
    created_at: string;
}

export interface InvoiceRow {
    id: string;
    user_id: string;
    subscription_id: string;
    subscription_period_id: string | null;
    rental_id: string | null;
    /** Gap-free, allocated by trg_allocate_invoice_number. Was not exposed at all. */
    invoice_number: string;
    purpose: InvoicePurpose;
    status: InvoiceStatus;
    issued_on: string | null;
    /** Was `due_date`. A date — an IST calendar day. */
    due_on: string | null;
    subtotal_amount: number;
    /** Was `amount_due`. */
    total_amount: number;
    currency: string;
    created_at: string;
    updated_at: string | null;

    // --- derived from v_invoice_balances / the allocations ----------------
    allocated_amount: number;
    balance_amount: number;
    payment_state: InvoicePaymentState;
    /** When the invoice was fully covered — the latest allocation's instant. */
    paid_at: string | null;
    payment_method: PaymentMethod | null;
    /** The gateway's own payment id, for reconciliation. Was `gateway_ref`. */
    gateway_ref: string | null;

    rider: { id: string; full_name: string; email: string | null } | null;
    items: InvoiceItemRow[];

    /**
     * Live-computed late renewal fee for an unpaid period invoice — only ever
     * populated on the rider's own GET /invoices/me (see myInvoicesHandler),
     * never on the admin listing, since it costs an extra lookup per invoice
     * and only the rider's Outstanding card needs it shown before they pay.
     * Undefined (not 0) when not applicable, so callers can tell "not late"
     * apart from "not computed here".
     */
    late_fee?: number;
    days_late?: number;
    total_due?: number;
}

export interface InvoiceDetail extends InvoiceRow {
    plan: { id: string; name: string } | null;
    /** `vehicles.name` was never a column — the new one is `display_name`. */
    vehicle: { id: string; display_name: string | null; registration_number: string } | null;
}

export interface ListInvoicesFilters {
    page: number;
    pageSize: number;
    status?: InvoiceStatus;
    paymentState?: InvoicePaymentState;
    purpose?: InvoicePurpose;
    userId?: string;
    bookingId?: string;
    sortBy: "created_at" | "total_amount" | "due_on";
    sortDir: "asc" | "desc";
}
