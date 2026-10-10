/**
 * Mirrors the `reward_card_status` / `referral_status` / `reward_redemption_status`
 * enums in supabase/migrations/20261010100000_referral_rewards.sql.
 */
export type ReferralStatus = "pending" | "qualified" | "rejected" | "revoked";
export type RewardCardStatus = "available" | "reserved" | "redeemed" | "expired" | "revoked";

export interface ReferralView {
    id: string;
    status: ReferralStatus;
    code_used: string;
    /** The referee's own safe display name — shown on the REFERRER's history list. */
    referee_display_name: string;
    qualified_at: string | null;
    created_at: string;
}

/** The referrer's own attribution row — what THEY see after applying a code. */
export interface MyAttributionView {
    status: ReferralStatus;
    code_used: string;
    /** First name only — a referee is shown who referred them, not their full identity. */
    referrer_display_name: string;
    created_at: string;
}

export interface RewardCardView {
    id: string;
    amount: number;
    status: RewardCardStatus;
    issued_at: string;
    expires_at: string | null;
    // No redeemed_at here: that timestamp lives on the redemption row
    // (referral_card_redemptions.redeemed_at), not the card itself — reading
    // it would mean joining to a table this module does not yet query, since
    // spending a card is not wired up yet (see the note at the bottom of
    // referrals.service.ts).
}

export interface ReferralSummary {
    /** Null only for a non-rider account — riders always have one by the time this resolves. */
    referral_code: string | null;
    program_enabled: boolean;
    /** Rupees. Shown so the rider knows what a successful referral is currently worth. */
    reward_amount: number;
    referred_count: number;
    pending_count: number;
    qualified_count: number;
    cards: RewardCardView[];
    available_card_count: number;
    total_earned: number;
    history: ReferralView[];
    /** Set once this account has applied someone else's code — null if not. */
    my_attribution: MyAttributionView | null;
}

/** Discriminated result so the controller can map each case to its own message. */
export type RedeemReferralResult =
    | { outcome: "applied"; attribution: MyAttributionView }
    | { outcome: "already_applied"; attribution: MyAttributionView };

/**
 * Kept for the three existing call sites (createBooking x2,
 * materializeBookingFromOrder) — none of them read the value, only await the
 * call, but changing the exported shape would be an unrelated signature
 * change to functions this work did not otherwise need to touch.
 */
export interface QualifyReferralResult {
    discount_amount: number;
}

export type ReferralQualifyingEvent = 'signup' | 'kyc_verified' | 'first_paid_booking';

/**
 * What the admin screen reads and edits. Deliberately narrower than the full
 * `referral_programs` row: `eligible_plan_ids`, `allow_stacking`,
 * `revoke_on_reversal`, `starts_at`/`ends_at` have DB defaults and no UI yet
 * — see the note at the bottom of referrals.service.ts.
 */
export interface ReferralProgramAdminView {
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
