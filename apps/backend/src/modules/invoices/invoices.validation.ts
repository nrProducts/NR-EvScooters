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

export const myInvoicesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    bookingId: z.string().uuid().optional(),
});
