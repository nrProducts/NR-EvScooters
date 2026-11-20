import { z } from "zod";

export const updateBillingCycleSettingsBody = z.object({
    allow_overdue_change: z.boolean(),
    max_extra_days: z.number().int().min(0).max(60),
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

export const applyBillingCycleBody = z.object({
    ...changeFields,
    reason: z.string().trim().min(3, "Enter a reason for the change.").max(500),
});
export type ApplyBillingCycleBody = z.infer<typeof applyBillingCycleBody>;
