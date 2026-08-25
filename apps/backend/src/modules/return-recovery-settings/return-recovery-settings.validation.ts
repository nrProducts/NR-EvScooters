import { z } from "zod";

export const updateReturnRecoverySettingsBody = z.object({
    max_late_fee_days: z.number().int().min(1).max(365),
    late_fee_per_day: z.number().min(0),
});

export type UpdateReturnRecoverySettingsBody = z.infer<typeof updateReturnRecoverySettingsBody>;
