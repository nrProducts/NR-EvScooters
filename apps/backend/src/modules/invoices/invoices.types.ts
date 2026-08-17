export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "void";
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
    "draft", "issued", "paid", "overdue", "void",
] as const;

export type PaymentStatus = "pending" | "processing" | "succeeded" | "failed" | "refunded";
export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
    "pending", "processing", "succeeded", "failed", "refunded",
] as const;

export type PaymentMethod = "card" | "wallet" | "upi" | "cash";

export type PaymentType = "rental" | "deposit" | "damage" | "penalty" | "refund" | "other";
export const PAYMENT_TYPES: readonly PaymentType[] = [
    "rental", "deposit", "damage", "penalty", "refund", "other",
] as const;

/** A single line on an invoice — see 20260817100000_billing_charge_engine.sql. Empty on every invoice minted before that migration. */
export interface InvoiceItemRow {
    id: string;
    item_type: "base_rental" | "charge" | "discount";
    rider_charge_id: string | null;
    label: string;
    amount: number;
    created_at: string;
}

export interface InvoiceRow {
    id: string;
    user_id: string;
    subscription_id: string | null;
    rental_id: string | null;
    booking_id: string | null;
    payment_type: PaymentType | null;
    status: InvoiceStatus;
    amount_due: number;
    due_date: string;
    payment_status: PaymentStatus;
    payment_method: PaymentMethod | null;
    gateway_ref: string | null;
    paid_at: string | null;
    created_at: string;
    updated_at: string | null;
    rider: { id: string; full_name: string; email: string | null } | null;
    items: InvoiceItemRow[];
}

export interface InvoiceDetail extends InvoiceRow {
    plan: { id: string; name: string } | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
}

export interface ListInvoicesFilters {
    page: number;
    pageSize: number;
    status?: InvoiceStatus;
    paymentStatus?: PaymentStatus;
    paymentType?: PaymentType;
    userId?: string;
    bookingId?: string;
    sortBy: "created_at" | "amount_due" | "due_date";
    sortDir: "asc" | "desc";
}
