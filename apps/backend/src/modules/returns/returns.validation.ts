import { z } from "zod";

export const rentalIdParam = z.object({ id: z.string().uuid("A valid rental id is required.") });

const damageItemSchema = z.object({
    amount: z.number().positive("Damage amount must be greater than 0."),
    description: z.string().trim().min(3, "Describe the damage in at least 3 characters."),
    photoPaths: z.array(z.string()).default([]),
});

const otherChargeSchema = z.object({
    label: z.string().trim().min(2, "Give the charge a label.").max(100),
    amount: z.number().positive("Charge amount must be greater than 0."),
});

export const approveReturnSettlementBody = z.object({
    damageItems: z.array(damageItemSchema).default([]),
    lateFeeOverride: z.number().min(0).optional(),
    otherCharges: z.array(otherChargeSchema).default([]),
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
