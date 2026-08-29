/**
 * Client-side mirror of the pre-pickup cancellation rule so the rider can be
 * shown an estimated fee and refund BEFORE confirming, and so the mock
 * repository behaves like the real API.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/bookings/cancellation.constants.ts
 *   apps/backend/src/modules/bookings/bookings.service.ts -> computeCancellationCharge
 *
 * The model is TIER-based: minutes elapsed since the booking was CREATED pick
 * a tier, and the rider keeps back `penalty_percent` of the plan amount they
 * paid (the deposit is always refunded in full). Past the last tier, 100% is
 * kept. The live tiers come from GET /cancellation-tiers; this file only
 * carries the shipped defaults for the estimate + the mock. The server always
 * recomputes authoritatively.
 */

export interface CancellationTier {
  /** Cancelling at ≤ this many minutes after booking falls in this tier. */
  upto_minutes: number;
  /** Percent of the plan amount paid kept back (0–100). */
  penalty_percent: number;
}

export const DEFAULT_CANCELLATION_TIERS: readonly CancellationTier[] = [
  { upto_minutes: 30, penalty_percent: 25 },
  { upto_minutes: 60, penalty_percent: 50 },
] as const;

/** Kept back once a cancellation is past every configured tier. */
export const BEYOND_LAST_TIER_PENALTY_PERCENT = 100;

export interface CancellationCharge {
  /** Whole minutes between the booking's creation and now. */
  elapsedMinutes: number;
  /** The resolved tier's percent, or BEYOND_LAST_TIER_PENALTY_PERCENT past every tier. */
  penaltyPercent: number;
  /** What the rider paid toward the plan (captured minus deposit), never negative. */
  planPaid: number;
  /** planPaid × penaltyPercent%. */
  penaltyAmount: number;
  /** The security deposit actually paid — always refunded in full pre-pickup. */
  depositRefund: number;
  /** (planPaid − penaltyAmount) + depositRefund. */
  refundAmount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeCancellationCharge(input: {
  /** What the rider paid toward the plan itself (plan price minus any discount). 0 for an unpaid booking. */
  planPaid: number | null;
  /** The security deposit actually paid — omit (or 0) if the booking was never paid. */
  depositAmount?: number | null;
  /** bookings.created_at — omit only where it genuinely isn't known. */
  createdAt?: string | null;
  now?: Date;
  tiers?: readonly CancellationTier[];
}): CancellationCharge {
  const tiers = [...(input.tiers ?? DEFAULT_CANCELLATION_TIERS)]
    .filter((t) => t.upto_minutes > 0)
    .sort((a, b) => a.upto_minutes - b.upto_minutes);

  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();
  const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  const elapsedMinutes = Number.isNaN(createdMs) || nowMs < createdMs
    ? 0
    : Math.floor((nowMs - createdMs) / 60_000);

  const tier = tiers.find((t) => elapsedMinutes <= t.upto_minutes);
  const penaltyPercent = tier ? tier.penalty_percent : BEYOND_LAST_TIER_PENALTY_PERCENT;

  const planPaid = round2(Math.max(0, input.planPaid ?? 0));
  const penaltyAmount = round2(planPaid * (penaltyPercent / 100));
  const depositRefund = round2(Math.max(0, input.depositAmount ?? 0));
  const refundAmount = round2(Math.max(0, planPaid - penaltyAmount) + depositRefund);

  return { elapsedMinutes, penaltyPercent, planPaid, penaltyAmount, depositRefund, refundAmount };
}

/** Human phrasing of how long ago the booking was made — for the confirmation dialog. */
export function describeElapsed(elapsedMinutes: number): string {
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
