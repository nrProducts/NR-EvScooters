import { apiClient } from "./httpClient";

export type ReferralQualifyingEvent = "signup" | "kyc_verified" | "first_paid_booking";

/**
 * The one referral programme row (see supabase/migrations/
 * 20261010100000_referral_rewards.sql) — there is no "create a campaign"
 * flow yet, only "edit the live programme's terms".
 */
export interface ReferralProgram {
  id: string;
  name: string;
  enabled: boolean;
  reward_amount: number;
  qualifying_event: ReferralQualifyingEvent;
  reward_expiry_days: number | null;
  max_rewards_per_referrer: number | null;
  min_renewal_amount: number;
  updated_at: string | null;
}

export interface UpdateReferralProgramInput {
  enabled: boolean;
  reward_amount: number;
  qualifying_event: ReferralQualifyingEvent;
  reward_expiry_days: number | null;
  max_rewards_per_referrer: number | null;
  min_renewal_amount: number;
}

/** GET /referrals/admin/program — admin only. */
export async function fetchReferralProgram(): Promise<ReferralProgram> {
  return apiClient.get<ReferralProgram>("/referrals/admin/program");
}

/** PUT /referrals/admin/program — admin only. Replaces the live programme's terms. */
export async function updateReferralProgram(input: UpdateReferralProgramInput): Promise<ReferralProgram> {
  return apiClient.put<ReferralProgram>("/referrals/admin/program", input);
}
