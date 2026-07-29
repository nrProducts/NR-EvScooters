/**
 * Client-side mirror of the pre-pickup cancellation rule so the rider can be
 * shown the exact fee and refund BEFORE confirming, and so the mock repository
 * behaves like the real API.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/bookings/cancellation.constants.ts
 *   apps/backend/src/modules/bookings/bookings.service.ts -> computeCancellationCharge
 *
 * The server always recomputes authoritatively; this is only an estimate for
 * the confirmation dialog. tests/bookingCancellation.test.ts runs the same
 * fixture table as the backend suite, so any drift between the two fails a test.
 */

/**
 * start_day is a DATE with no time, so pickup is treated as 00:00 on that day
 * and "more than 24h notice" is expressed in whole days: free when start_day is
 * this many calendar days out or more.
 */
export const FREE_CANCELLATION_NOTICE_DAYS = 2;

/** Share of the net plan price kept back when cancelling inside the free window. */
export const LATE_CANCELLATION_PENALTY_RATE = 0.25;

/**
 * Grace period from booking creation during which cancelling is always free,
 * however close pickup is. Without it a booking made FOR tomorrow is born
 * inside the notice window and would be charged seconds after creation.
 */
export const FREE_CANCELLATION_GRACE_MINUTES = 60;

export interface CancellationCharge {
  /** Whole calendar days from today to start_day; negative once start_day has passed. */
  daysUntilPickup: number;
  isLate: boolean;
  /** True when the booking is still inside its post-creation grace period. */
  withinGrace: boolean;
  /** Plan price minus any referral discount — what the rider would actually have owed. */
  chargeableAmount: number;
  penaltyAmount: number;
  refundAmount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Free when EITHER the booking was created within
 * FREE_CANCELLATION_GRACE_MINUTES, OR pickup is 2+ calendar days out:
 *
 *   +2 days or more -> free  |  +1 (tomorrow), today, or past -> penalty
 *
 * The penalty applies to the NET price (after any referral discount) — charging
 * a fee on an amount the rider was never going to owe would be wrong.
 */
export function computeCancellationCharge(input: {
  startDay: string;
  planPrice: number | null;
  discountAmount?: number | null;
  /** bookings.created_at — omit only where it genuinely isn't known. */
  createdAt?: string | null;
  now?: Date;
}): CancellationCharge {
  const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();

  const start = new Date(`${input.startDay}T00:00:00`);
  const today = input.now ? new Date(input.now) : new Date();
  today.setHours(0, 0, 0, 0);

  // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
  // which would otherwise slide the boundary by a whole day.
  const daysUntilPickup = Number.isNaN(start.getTime())
    ? 0
    : Math.round((start.getTime() - today.getTime()) / 86_400_000);

  const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
  const withinGrace = !Number.isNaN(createdMs)
    && nowMs - createdMs <= FREE_CANCELLATION_GRACE_MINUTES * 60_000
    && nowMs >= createdMs;

  const isLate = !withinGrace && daysUntilPickup < FREE_CANCELLATION_NOTICE_DAYS;
  const chargeableAmount = round2(Math.max(0, (input.planPrice ?? 0) - (input.discountAmount ?? 0)));
  const penaltyAmount = isLate ? round2(chargeableAmount * LATE_CANCELLATION_PENALTY_RATE) : 0;
  const refundAmount = Math.max(0, round2(chargeableAmount - penaltyAmount));

  return { daysUntilPickup, isLate, withinGrace, chargeableAmount, penaltyAmount, refundAmount };
}

/** "today" / "tomorrow" / "already past" — for the confirmation dialog copy. */
export function describePickupTiming(daysUntilPickup: number): string {
  if (daysUntilPickup < 0) return 'already past';
  if (daysUntilPickup === 0) return 'today';
  if (daysUntilPickup === 1) return 'tomorrow';
  return `in ${daysUntilPickup} days`;
}
