/**
 * Display-only formatting for an active rental's timeline. NO POLICY LIVES
 * HERE — the deadline itself (rentals.expires_at) is computed and frozen by
 * the server at pickup (apps/backend .. planExpiryFor, migration
 * 20260804100000). These functions only render a server value; they never
 * derive one. Anything that decides what a rider OWES belongs in
 * lib/returnPolicy.ts alongside its backend mirror.
 *
 * Computes in DEVICE-local time, same caveat as returnPolicy.ts: fine for
 * "12 days left", never for money.
 */

const DAY_MS = 86_400_000;

/** Midnight of the calendar day `d` falls on, device-local. */
function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Whole calendar days between two instants. Math.round rather than floor so a
 * DST shift (a 23- or 25-hour gap) doesn't slide the boundary by a whole day —
 * same reasoning as computeLateReturnPenalty.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * Which day of the rental today is, 1-based: the pickup day is Day 1. Matches
 * planExpiryFor's Day-1-inclusive rule, so an N-day plan ends on Day N.
 * Returns 0 for an unparseable date so callers can skip the row.
 */
export function rentalDayNumber(startedAt: string, now: Date = new Date()): number {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return 0;
  return Math.max(1, calendarDaysBetween(started, now) + 1);
}

export type ExpiryTone = 'neutral' | 'warning' | 'danger';

export interface ExpiryDescription {
  /** "Sat, Sep 5 · 12 days left" — the value for the "Renews on" row. */
  text: string;
  /** "Your plan ends in 2 days." — a full sentence for the nudge strip. */
  headline: string;
  tone: ExpiryTone;
  /** Whole calendar days until expiry; negative once past it. */
  daysLeft: number;
}

/** Days out at which the card starts nudging — matches WARN_DAYS_BEFORE in the plan-expiry-reminder function. */
export const EXPIRY_WARNING_DAYS = 3;

/**
 * Formats rentals.expires_at for the Home card. Null in, null out — a rental
 * with no plan has no expiry and the caller should render nothing at all
 * rather than guessing a date.
 */
export function describeExpiry(expiresAt: string | null, now: Date = new Date()): ExpiryDescription | null {
  if (!expiresAt) return null;
  const expires = new Date(expiresAt);
  if (Number.isNaN(expires.getTime())) return null;

  const daysLeft = calendarDaysBetween(now, expires);
  const on = expires.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (daysLeft < 0) {
    const over = Math.abs(daysLeft);
    return {
      text: `Expired ${over} day${over > 1 ? 's' : ''} ago`,
      headline: `Your plan expired ${over} day${over > 1 ? 's' : ''} ago.`,
      tone: 'danger',
      daysLeft,
    };
  }

  if (daysLeft === 0) {
    return { text: `${on} · last day`, headline: 'Your plan ends today.', tone: 'danger', daysLeft };
  }

  return {
    text: `${on} · ${daysLeft} day${daysLeft > 1 ? 's' : ''} left`,
    headline: `Your plan ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}.`,
    tone: daysLeft <= EXPIRY_WARNING_DAYS ? 'warning' : 'neutral',
    daysLeft,
  };
}
