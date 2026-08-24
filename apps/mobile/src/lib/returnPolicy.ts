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

/**
 * Riders can't back out mid-period — only once their current committed week
 * is up. Mirrors requestReturn's gate in rentals.service.ts, anchored to
 * bookings.next_due_at (rolls forward every renewal) rather than
 * rentals.expires_at (frozen at pickup as the FIRST period's end, so it'd
 * stop meaning anything by week 2+). No plan at all (next_due_at null)
 * fails open — nothing to gate against.
 */
export function canReturnYet(nextDueAt: string | null, now: Date = new Date()): boolean {
  if (!nextDueAt) return true;
  const todayIso = now.toISOString().slice(0, 10);
  return todayIso >= nextDueAt;
}

/** YYYY-MM-DD in local time, to compare against next_due_at (a date-only column) the same way the rider reads it on screen. */
function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface RenewalEligibility {
  /** Whether "Renew Plan" should be offered at all right now. */
  canRenew: boolean;
  /** True once next_due_at has already passed — a late renewal fee applies and paying activates the new period immediately (server-computed; not estimated here). */
  isLate: boolean;
  /** True once an earlier renewal has already been paid and is waiting to activate — nothing more to do until then. */
  alreadyScheduled: boolean;
}

/**
 * Whether "Renew Plan" should be offered — only from the plan's last day
 * onward (today >= next_due_at), never earlier. The backend's
 * requestEarlyRecharge gate in apps/backend/src/modules/bookings/bookings
 * .service.ts still accepts a renewal at any point (plan_status 'active' or
 * 'past_due', nothing scheduled yet) — this is a display-only restriction so
 * the button doesn't invite a rider to pay for a period that hasn't started
 * yet, not a change to what the server will accept.
 *
 * `due` is `past_due` — the same state, read off `subscriptions.status` now
 * rather than the departed `bookings.plan_status`.
 * Single source of truth — my-scooter.tsx, billing.tsx and home.tsx all
 * import this rather than keeping their own copy.
 */
export function getRenewalEligibility(
  planStatus: 'active' | 'past_due' | 'paused' | null,
  nextDueAt: string | null,
  renewalStatus: 'none' | 'scheduled' | null,
  now: Date = new Date(),
): RenewalEligibility {
  const alreadyScheduled = renewalStatus === 'scheduled';
  const canRenew = !alreadyScheduled
    && (planStatus === 'active' || planStatus === 'past_due')
    && !!nextDueAt
    && dateStr(now) >= nextDueAt;
  const isLate = !!nextDueAt && dateStr(now) > nextDueAt;
  return { canRenew, isLate, alreadyScheduled };
}

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
  /** Admin-configured cap (return_recovery_settings.max_late_fee_days, delivered on the rental). Defaults to MAX_LATE_PENALTY_DAYS when omitted. */
  maxDays?: number;
}): LateReturnCharge {
  const feePerDay = LATE_RETURN_FEE_PER_DAY;
  const cap = input.maxDays ?? MAX_LATE_PENALTY_DAYS;

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
  const daysLate = Math.min(Math.max(0, rawDaysLate), cap);

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
