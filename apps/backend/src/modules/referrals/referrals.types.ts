export type ReferralStatus = "pending" | "qualified" | "rewarded";

export interface ReferralReward {
    id: string;
    amount: number;
    reason: string;
    created_at: string;
}

export interface ReferralSummary {
    referral_code: string | null;
    referred_count: number;
    qualified_count: number;
    offer_amount: number;
    rewards: ReferralReward[];
}

export interface ReferralView {
    id: string;
    status: ReferralStatus;
    code_used: string;
    qualified_at: string | null;
    rewarded_at: string | null;
    created_at: string;
}

export interface QualifyReferralResult {
    discount_amount: number;
}
