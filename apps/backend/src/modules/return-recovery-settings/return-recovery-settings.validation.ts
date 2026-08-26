import { z } from "zod";

// late_fee_per_day is deliberately NOT here — it's resolved live from the
// same global late-fee rate renewals use (plan-renewal-settings), so there's
// only ever one number an admin can configure for "late fee per day."
export const updateReturnRecoverySettingsBody = z.object({
    max_late_fee_days: z.number().int().min(1).max(365),
});

export type UpdateReturnRecoverySettingsBody = z.infer<typeof updateReturnRecoverySettingsBody>;
