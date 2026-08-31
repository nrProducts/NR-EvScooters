/**
 * Ported verbatim from apps/mobile/src/lib/rentalTiming.ts — keep in sync.
 *
 * Display-only formatting for an active rental's timeline. NO POLICY LIVES
 * HERE — the deadline itself (rentals.expires_at) is computed and frozen by
 * the server at pickup. Computes in browser-local time: fine for "12 days
 * left", never for money.
 */

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function calendarDaysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

export function rentalDayNumber(startedAt: string, now: Date = new Date()): number {
  const started = new Date(startedAt);
  if (Number.isNaN(started.getTime())) return 0;
  return Math.max(1, calendarDaysBetween(started, now) + 1);
}

export type ExpiryTone = 'neutral' | 'warning' | 'danger';

export interface ExpiryDescription {
  text: string;
  headline: string;
  tone: ExpiryTone;
  daysLeft: number;
}

export const EXPIRY_WARNING_DAYS = 3;

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
