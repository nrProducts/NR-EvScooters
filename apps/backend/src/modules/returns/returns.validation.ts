import { z } from "zod";

export const rentalIdParam = z.object({ id: z.string().uuid("A valid rental id is required.") });
export const rentalDamageIdParam = z.object({
    id: z.string().uuid("A valid rental id is required."),
    damageId: z.string().uuid("A valid damage id is required."),
});

const otherChargeSchema = z.object({
    label: z.string().trim().min(2, "Give the charge a label.").max(100),
    amount: z.number().positive("Charge amount must be greater than 0."),
});

/** Admin Inspection — "Save Inspection" / "Request Payment from Rider". */
export const saveInspectionBody = z.object({
    otherCharges: z.array(otherChargeSchema).default([]),
    confirmNoDamage: z.boolean().default(false),
});
export type SaveInspectionBody = z.infer<typeof saveInspectionBody>;

export const approveReturnSettlementBody = z.object({
    endBatteryPct: z.number().min(0).max(100).optional(),
});
export type ApproveReturnSettlementBody = z.infer<typeof approveReturnSettlementBody>;

export const listSettlementsQuery = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(8),
    status: z.enum([
        "pending_refund", "refund_processing", "refund_completed",
        "no_refund_required", "amount_due", "settlement_completed",
    ]).optional(),
    sortBy: z.enum(["created_at", "settled_at"]).default("created_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListSettlementsQuery = z.infer<typeof listSettlementsQuery>;
