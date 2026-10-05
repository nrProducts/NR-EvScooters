/**
 * Compile-time fallback for the pre-pickup cancellation policy — used only
 * when `cancellation_tiers` is empty (or unreachable). The live policy is a
 * table an admin edits on Billing & Charges.
 *
 * Mirrored (deliberately, with a pointer comment) in
 * apps/mobile/src/lib/cancellationPolicy.ts so the rider can be shown what
 * they'd get back before confirming; shared test fixtures guard against drift.
 *
 * The model: minutes elapsed since the booking was CREATED decide the tier.
 * A cancellation keeps `penaltyPercent` of the plan amount the rider actually
 * paid (captured total minus the deposit). The deposit is always refunded in
 * full — no damage is possible before pickup. Past the largest tier, 100% is
 * kept (no plan refund).
 */

export interface CancellationTier {
    /** Cancelling at ≤ this many minutes after booking falls in this tier. */
    upto_minutes: number;
    /** Percent of the plan amount paid that is kept back (0–100). */
    penalty_percent: number;
}

export const DEFAULT_CANCELLATION_TIERS: readonly CancellationTier[] = [
    { upto_minutes: 30, penalty_percent: 25 },
    { upto_minutes: 60, penalty_percent: 50 },
] as const;

/** Kept back once a cancellation is past every configured tier. */
export const BEYOND_LAST_TIER_PENALTY_PERCENT = 100;
