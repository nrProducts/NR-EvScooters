import { z } from "zod";

export const updateReturnRecoverySettingsBody = z.object({
    max_late_fee_days: z.number().int().min(1).max(365),
});

export type UpdateReturnRecoverySettingsBody = z.infer<typeof updateReturnRecoverySettingsBody>;
