import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { INVOICE_PAYMENT_STATES, INVOICE_PURPOSES, INVOICE_STATUSES } from "./invoices.types";

export const uuidParam = z.object({ id: z.string().uuid("A valid invoice id is required.") });

export const listInvoicesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(INVOICE_STATUSES as [string, ...string[]]).optional(),
    // Derived, not a column — see InvoicePaymentState.
    paymentState: z.enum(INVOICE_PAYMENT_STATES as [string, ...string[]]).optional(),
    // Was `paymentType`. An invoice is raised for a REASON, not for a
    // payment kind.
    purpose: z.enum(INVOICE_PURPOSES as [string, ...string[]]).optional(),
    userId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
    sortBy: z.enum(["created_at", "total_amount", "due_on"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const refundBody = z.object({
    reason: z.string().trim().min(3, "Give a reason for the refund.").max(500).optional(),
});

export const recordPaymentBody = z.object({
    method: z.enum(["upi", "card", "netbanking", "wallet", "cash"]),
});

const adhocLine = z.object({
    description: z.string().trim().min(2, "Describe what each charge is for.").max(200),
    amount: z.number().positive("Enter an amount greater than zero.").max(10_000_000),
});

/**
 * One or more charge lines, with an optional GST rate on top. The single
 * `description` + `amount` form is still accepted (it is one line, no GST).
 */
export const adhocChargeBody = z.object({
    user_id: z.string().uuid("Select a rider."),
    items: z.array(adhocLine).min(1).max(20).optional(),
    gst_rate: z.number().min(0).max(100).default(0),
    description: adhocLine.shape.description.optional(),
    amount: adhocLine.shape.amount.optional(),
    payment: z.object({
        method: z.enum(["upi", "card", "netbanking", "wallet", "cash"]),
        status: z.enum(["paid", "pending"]),
    }).optional(),
}).refine((b) => !!b.items || (b.description !== undefined && b.amount !== undefined), {
    message: "Add at least one charge line.",
    path: ["items"],
});

export type AdhocChargeBody = z.infer<typeof adhocChargeBody>;

export const changeAmountBody = z.object({
    amount: z.number().positive("Enter an amount greater than zero.").max(10_000_000),
    reason: z.string().trim().min(3, "Give a reason for the change.").max(500).optional(),
});

export const deleteInvoiceBody = z.object({
    reason: z.string().trim().min(3, "Give a reason for deleting the invoice.").max(500).optional(),
});

export const myInvoicesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    bookingId: z.string().uuid().optional(),
});
