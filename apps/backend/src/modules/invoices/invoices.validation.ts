import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";
import { INVOICE_STATUSES, PAYMENT_STATUSES, PAYMENT_TYPES } from "./invoices.types";

export const uuidParam = z.object({ id: z.string().uuid("A valid invoice id is required.") });

export const listInvoicesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(INVOICE_STATUSES as [string, ...string[]]).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES as [string, ...string[]]).optional(),
    paymentType: z.enum(PAYMENT_TYPES as [string, ...string[]]).optional(),
    userId: z.string().uuid().optional(),
    bookingId: z.string().uuid().optional(),
    sortBy: z.enum(["created_at", "amount_due", "due_date"]).default("created_at"),
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
