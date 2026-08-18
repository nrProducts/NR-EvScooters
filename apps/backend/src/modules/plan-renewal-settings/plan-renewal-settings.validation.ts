import { z } from "zod";

export const updatePlanRenewalSettingsBody = z.object({
    late_fee_enabled: z.boolean(),
    late_fee_amount: z.number().min(0).max(100000),
});

export type UpdatePlanRenewalSettingsBody = z.infer<typeof updatePlanRenewalSettingsBody>;
