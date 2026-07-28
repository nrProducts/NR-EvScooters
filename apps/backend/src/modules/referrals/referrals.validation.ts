import { z } from "zod";

export const redeemReferralBody = z.object({
    code: z.string().trim().min(4).max(16).toUpperCase(),
});

export type RedeemReferralBody = z.infer<typeof redeemReferralBody>;
