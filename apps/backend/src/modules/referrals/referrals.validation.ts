import { z } from "zod";
import { REFERRAL_CODE_LENGTH } from "./referrals.constants";

export const redeemReferralBody = z.object({
    code: z.string().trim().length(REFERRAL_CODE_LENGTH).toUpperCase(),
});

export type RedeemReferralBody = z.infer<typeof redeemReferralBody>;

export const updateReferralProgramBody = z.object({
    enabled: z.boolean(),
    reward_amount: z.number().min(0).max(1_000_000),
    qualifying_event: z.enum(["signup", "kyc_verified", "first_paid_booking"]),
    // null = never expires / no cap — an empty field, not a zero.
    reward_expiry_days: z.number().int().min(1).max(3650).nullable(),
    max_rewards_per_referrer: z.number().int().min(1).max(100_000).nullable(),
    min_renewal_amount: z.number().min(0).max(1_000_000),
});

export type UpdateReferralProgramBody = z.infer<typeof updateReferralProgramBody>;
