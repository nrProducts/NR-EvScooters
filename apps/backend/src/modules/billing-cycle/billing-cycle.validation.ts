import { z } from "zod";

export const updateBillingCycleSettingsBody = z.object({
    allow_overdue_change: z.boolean(),
    max_extra_days: z.number().int().min(0).max(60),
    charge_enabled: z.boolean(),
    change_fee: z.number().min(0).max(100000),
});
export type UpdateBillingCycleSettingsBody = z.infer<typeof updateBillingCycleSettingsBody>;

export const billingCycleBookingParam = z.object({
    id: z.string().uuid(),
});

const changeFields = {
    new_due_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    new_due_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)."),
};

export const previewBillingCycleBody = z.object(changeFields);
export type PreviewBillingCycleBody = z.infer<typeof previewBillingCycleBody>;

export const applyBillingCycleBody = z
    .object({
        ...changeFields,
        reason: z.string().trim().min(3, "Enter a reason for the change.").max(500),
        waive_charge: z.boolean().optional(),
        waive_reason: z.string().trim().max(500).optional(),
        collected_method: z.enum(["cash", "upi", "card", "netbanking", "wallet"]).optional(),
    })
    .superRefine((body, ctx) => {
        if (body.waive_charge && (body.waive_reason ?? "").length < 3) {
            ctx.addIssue({ code: "custom", path: ["waive_reason"], message: "Enter why the charge is being waived." });
        }
        if (body.waive_charge && body.collected_method) {
            ctx.addIssue({ code: "custom", path: ["collected_method"], message: "A waived charge can't also be collected." });
        }
    });
export type ApplyBillingCycleBody = z.infer<typeof applyBillingCycleBody>;
