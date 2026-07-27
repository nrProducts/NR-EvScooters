export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "void";
export const INVOICE_STATUSES: readonly InvoiceStatus[] = [
    "draft", "issued", "paid", "overdue", "void",
] as const;

export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export const PAYMENT_STATUSES: readonly PaymentStatus[] = [
    "pending", "succeeded", "failed", "refunded",
] as const;

export type PaymentMethod = "card" | "wallet" | "upi" | "cash";

export interface InvoiceRow {
    id: string;
    user_id: string;
    subscription_id: string | null;
    rental_id: string | null;
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
    userId?: string;
}
