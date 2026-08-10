import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const bookingIdParam = z.object({ bookingId: z.string().uuid("A valid booking id is required.") });

export const listDepositsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    status: z.enum(["pending", "held", "partially_refunded", "refunded", "forfeited"]).optional(),
    refundEligible: z.coerce.boolean().optional(),
});

export type ListDepositsQuery = z.infer<typeof listDepositsQuery>;
