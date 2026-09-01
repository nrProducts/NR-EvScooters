/**
 * Display-only formatting for an active rental's timeline. NO POLICY LIVES
 * HERE — the deadline itself (rentals.expires_at) is computed and frozen by
 * the server at pickup (apps/backend .. planExpiryFor, migration
 * 20260804100000). These functions only render a server value; they never
 * derive one. Anything that decides what a rider OWES belongs in
 * lib/returnPolicy.ts alongside its backend mirror.
 *
 * Day boundaries are IST (Asia/Kolkata), NOT the device's timezone — every
 * `date` in this system is an IST calendar day (see apps/backend/src/common/
 * dates.ts). A rider whose phone is set to another zone must still see "Day 1"
 * on the pickup day, so the day math is anchored to the business day, not the
 * handset clock. Fine for "12 days left", never for money.
 */

const DAY_MS = 86_400_000;
const BUSINESS_TZ = 'Asia/Kolkata';

// en-CA renders as YYYY-MM-DD, which is exactly the IST calendar-day key.
const istDayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TZ });

/**
 * Midnight (as a UTC millisecond count) of the IST calendar day that instant
 * `d` falls on. Only ever subtracted from another such value, so the fictional
 * "IST-day-at-UTC-midnight" instant is just a stable, DST-free sort key.
 */
function startOfDayMs(d: Date): number {
  const istDay = istDayFormat.format(d); // e.g. "2026-08-31"
  return Date.parse(`${istDay}T00:00:00Z`);
}

/**
 * Whole IST calendar days between two instants. Both ends are bucketed to their
 * IST day first, so the result is a clean integer regardless of the time of day
 * or the device timezone.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDayMs(to) - startOfDayMs(from)) / DAY_MS);
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
