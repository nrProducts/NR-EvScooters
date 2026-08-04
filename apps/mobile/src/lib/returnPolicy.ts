/**
 * Client-side mirror of the post-pickup late-return rule so the rider can be
 * shown the deadline and running fee before submitting, and so the mock
 * repository behaves like the real API.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/rentals/returnPolicy.constants.ts
 *   apps/backend/src/modules/rentals/rentals.service.ts
 *     -> returnDeadlineFor / computeLateReturnPenalty
 *
 * The server always recomputes authoritatively at handover; this is a display
 * estimate. tests/rentalReturn.test.ts runs the same fixture table as the
 * backend suite, so any drift between the two fails a test.
 *
 * NOTE: this computes in DEVICE-local time, a third clock alongside the
 * server's and the DB's UTC. That is acceptable only because the value is an
 * estimate — after submitting, always render the server-returned
 * `return_due_at`, never the locally guessed one.
 */

/** Flat fee, in rupees, per WHOLE CALENDAR DAY past the deadline. */
export const LATE_RETURN_FEE_PER_DAY = 100;

/** Safety cap so an abandoned rental can't show an absurd running total. */
export const MAX_LATE_PENALTY_DAYS = 30;

export const RETURN_REASONS = [
  'plan_ended',
  'switching_plan',
  'scooter_issue',
  'moving_away',
  'too_expensive',
  'other',
] as const;

export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  plan_ended: 'My plan ended',
  switching_plan: 'Switching plan',
  scooter_issue: 'Problem with the scooter',
  moving_away: 'Moving away',
  too_expensive: 'Too expensive',
  other: 'Something else',
};

export interface LateReturnCharge {
  daysLate: number;
  isLate: boolean;
  feePerDay: number;
  penaltyAmount: number;
  /** false when the rental had no deadline at all — neither a return request nor a plan expiry. */
  hadDeadline: boolean;
}

/** End of the calendar day `at` falls on, in device-local time. */
export function returnDeadlineFor(at: Date): Date {
  const due = new Date(at);
  due.setHours(23, 59, 59, 999);
  return due;
}

/**
 * When a plan bought on `startedAt` runs out. Day 1 is the pickup day, so a
 * 30-day plan runs through the end of day 30 — not day 31.
 *
 * Mirrors planExpiryFor in apps/backend/src/modules/rentals/rentals.service.ts
 * and the backfill in 20260804100000_plan_period_and_rental_expiry.sql. The
 * server writes rentals.expires_at at pickup and that value is what the UI
 * renders — this exists so mock mode produces the same dates.
 */
export function planExpiryFor(startedAt: Date, durationDays: number): Date {
  const expires = new Date(startedAt);
  expires.setDate(expires.getDate() + durationDays - 1);
  return returnDeadlineFor(expires);
}

/**
 * The rider's real deadline. Their plan's expiry is the default; requesting an
 * early return overrides it. Mirrors effectiveDueAt in
 * apps/backend/src/modules/rentals/rentals.service.ts — pass this into
 * computeLateReturnPenalty rather than return_due_at alone, or a rider sitting
 * past their plan's expiry will show a zero fee that the server then charges.
 */
export function effectiveDueAt(
  rental: { return_due_at: string | null; expires_at: string | null },
): string | null {
  return rental.return_due_at ?? rental.expires_at;
}

/**
 *   handed over any time on the due day -> 0  |  00:30 the next day -> 1 day
 *
 * A null/unparseable deadline means the rental had no deadline at all — no
 * return request and no plan to expire — so nothing is owed. Fail open rather
 * than charge.
 */
export function computeLateReturnPenalty(input: {
  returnDueAt: string | null;
  now?: Date;
}): LateReturnCharge {
  const feePerDay = LATE_RETURN_FEE_PER_DAY;

  if (!input.returnDueAt) {
    return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadDeadline: false };
  }

  const due = new Date(input.returnDueAt);
  if (Number.isNaN(due.getTime())) {
    return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadDeadline: false };
  }

  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const returnDay = input.now ? new Date(input.now) : new Date();
  returnDay.setHours(0, 0, 0, 0);

  // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
  // which would otherwise slide the boundary by a whole day.
  const rawDaysLate = Math.round((returnDay.getTime() - dueDay.getTime()) / 86_400_000);
  const daysLate = Math.min(Math.max(0, rawDaysLate), MAX_LATE_PENALTY_DAYS);

  return {
    daysLate,
    isLate: daysLate > 0,
    feePerDay,
    penaltyAmount: Math.round(daysLate * feePerDay * 100) / 100,
    hadDeadline: true,
  };
}

/** "today by 11:59 PM" / "2 days ago" — for deadline copy. */
export function describeReturnDeadline(dueAt: string | null): string {
  if (!dueAt) return 'today by 11:59 PM';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'today by 11:59 PM';

  const { daysLate } = computeLateReturnPenalty({ returnDueAt: dueAt });
  if (daysLate === 0) {
    return `${due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} by 11:59 PM`;
  }
  return `${daysLate} day${daysLate > 1 ? 's' : ''} ago`;
}
