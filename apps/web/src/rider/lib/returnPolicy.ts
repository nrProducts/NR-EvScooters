/**
 * Ported verbatim from apps/mobile/src/lib/returnPolicy.ts — keep in sync.
 *
 * Client-side mirror of the post-pickup late-return rule so the rider can be
 * shown the deadline and running fee before submitting.
 *
 * SOURCE OF TRUTH is the backend:
 *   apps/backend/src/modules/rentals/returnPolicy.constants.ts
 *   apps/backend/src/modules/rentals/rentals.service.ts
 *     -> returnDeadlineFor / computeLateReturnPenalty
 *
 * Computes in browser-local time — fine for "12 days left", never for money.
 * After submitting, always render the server-returned `return_due_at`.
 */

export const LATE_RETURN_FEE_PER_DAY = 100;

export function canReturnYet(nextDueAt: string | null, now: Date = new Date()): boolean {
  if (!nextDueAt) return true;
  const todayIso = now.toISOString().slice(0, 10);
  return todayIso >= nextDueAt;
}

function dateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export interface RenewalEligibility {
  canRenew: boolean;
  isLate: boolean;
  alreadyScheduled: boolean;
}

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
  hadDeadline: boolean;
}

export function returnDeadlineFor(at: Date): Date {
  const due = new Date(at);
  due.setHours(23, 59, 59, 999);
  return due;
}

export function planExpiryFor(startedAt: Date, durationDays: number): Date {
  const expires = new Date(startedAt);
  expires.setDate(expires.getDate() + durationDays - 1);
  return returnDeadlineFor(expires);
}

export function effectiveDueAt(
  rental: { return_due_at: string | null; expires_at: string | null },
): string | null {
  return rental.return_due_at ?? rental.expires_at;
}

export function computeLateReturnPenalty(input: {
  returnDueAt: string | null;
  now?: Date;
  maxDays?: number;
  feePerDay?: number;
}): LateReturnCharge {
  const feePerDay = input.feePerDay ?? LATE_RETURN_FEE_PER_DAY;
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
