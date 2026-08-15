import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const refundIdParam = z.object({ id: z.string().uuid("A valid refund id is required.") });

export const listRefundsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(["pending", "processing", "success", "failed"]).optional(),
    refundType: z.enum(["deposit", "booking_cancellation"]).optional(),
    bookingId: z.string().uuid().optional(),
    sortBy: z.enum(["created_at", "amount"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const initiateRefundBody = z.object({
    deposit_id: z.string().uuid("A valid deposit id is required."),
});

export type ListRefundsQuery = z.infer<typeof listRefundsQuery>;
export type InitiateRefundBody = z.infer<typeof initiateRefundBody>;
