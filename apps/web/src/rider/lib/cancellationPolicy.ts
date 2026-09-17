/**
 * Ported verbatim from apps/mobile/src/lib/cancellationPolicy.ts — keep in sync.
 *
 * Client-side mirror of the pre-pickup cancellation rule so the rider can be
 * shown an estimated fee and refund BEFORE confirming.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/bookings/cancellation.constants.ts
 *   apps/backend/src/modules/bookings/bookings.service.ts -> computeCancellationCharge
 *
 * This is now a third copy alongside the backend and the mobile app.
 */

export interface CancellationTier {
  upto_minutes: number;
  penalty_percent: number;
}

export const DEFAULT_CANCELLATION_TIERS: readonly CancellationTier[] = [
  { upto_minutes: 30, penalty_percent: 25 },
  { upto_minutes: 60, penalty_percent: 50 },
] as const;

export const BEYOND_LAST_TIER_PENALTY_PERCENT = 100;

export interface CancellationCharge {
  elapsedMinutes: number;
  penaltyPercent: number;
  planPaid: number;
  penaltyAmount: number;
  depositRefund: number;
  /** The onboarding charge, kept in full — neither refunded nor penalised. */
  onboardingKept: number;
  refundAmount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeCancellationCharge(input: {
  planPaid: number | null;
  depositAmount?: number | null;
  /** The onboarding charge paid — omit (or 0) for a booking taken before the split. */
  onboardingCharge?: number | null;
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
  const onboardingKept = round2(Math.max(0, input.onboardingCharge ?? 0));
  const refundAmount = round2(Math.max(0, planPaid - penaltyAmount) + depositRefund);

  return {
    elapsedMinutes, penaltyPercent, planPaid, penaltyAmount,
    depositRefund, onboardingKept, refundAmount,
  };
}

export function describeElapsed(elapsedMinutes: number): string {
  if (elapsedMinutes < 1) return 'just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
