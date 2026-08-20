import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../../common/pagination";

export const rentalIdParam = z.object({ id: z.string().uuid("A valid rental id is required.") });
export const damageIdParam = z.object({ id: z.string().uuid("A valid damage id is required.") });

export const recordDamageBody = z.object({
    amount: z.coerce.number().min(0, "Amount can't be negative."),
    description: z.string().trim().min(3, "Describe the damage in at least 3 characters.").max(2000),
});

export const disputeDamageBody = z.object({
    reason: z.string().trim().min(3, "Give a reason of at least 3 characters.").max(1000),
});

export const resolveDisputeBody = z.object({
    resolved_amount: z.coerce.number().min(0).optional(),
    notes: z.string().trim().min(3, "Give resolution notes of at least 3 characters.").max(1000),
});

export const myDamagesQuery = z.object({
    bookingId: z.string().uuid("A valid booking id is required."),
});

export const listDamagesQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    bookingId: z.string().uuid().optional(),
    // `damage_status`: `recorded` is `assessed`; `settled` and `waived` are new.
    status: z.enum(["assessed", "disputed", "settled", "waived"]).optional(),
    sortBy: z.enum(["created_at", "assessed_amount"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export type RecordDamageBody = z.infer<typeof recordDamageBody>;
export type DisputeDamageBody = z.infer<typeof disputeDamageBody>;
export type ResolveDisputeBody = z.infer<typeof resolveDisputeBody>;
export type ListDamagesQuery = z.infer<typeof listDamagesQuery>;
