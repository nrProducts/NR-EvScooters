import { describe, expect, it } from 'vitest';
import { EXPIRY_WARNING_DAYS, describeExpiry, rentalDayNumber } from '../src/lib/rentalTiming';

/**
 * Every instant here is written with an explicit +05:30 (IST) offset. The
 * functions under test bucket by IST calendar day regardless of the test
 * runner's timezone, so the cases must be anchored the same way to stay
 * deterministic on any machine / CI.
 */
const ist = (day: string, hhmm = '12:00'): Date => new Date(`${day}T${hhmm}:00+05:30`);
/** rentals.expires_at as the server writes it — end of an IST calendar day. */
const endOfIstDay = (day: string): string => new Date(`${day}T23:59:59+05:30`).toISOString();

describe('rentalDayNumber', () => {
  it('calls the pickup day Day 1', () => {
    expect(rentalDayNumber(ist('2026-08-31', '09:00').toISOString(), ist('2026-08-31', '18:00'))).toBe(1);
  });

  it('rolls to Day 2 on the next IST day, not 24 hours later', () => {
    expect(rentalDayNumber(ist('2026-08-31', '23:00').toISOString(), ist('2026-09-01', '01:00'))).toBe(2);
  });

  it('stays Day 1 for a device in another timezone on the pickup day', () => {
    // Picked up 10:00 IST on Aug 31; "now" is 22:00 the same IST day, but the
    // handset clock is in US Pacific (would read Aug 31 09:30 there — still,
    // and the pickup instant reads Aug 30 there). Must be Day 1, not Day 2.
    const pickup = new Date('2026-08-31T10:00:00+05:30').toISOString();
    const now = new Date('2026-08-31T22:00:00+05:30');
    expect(rentalDayNumber(pickup, now)).toBe(1);
  });

  it('counts across a month', () => {
    expect(rentalDayNumber(ist('2026-08-02', '09:00').toISOString(), ist('2026-08-31', '09:00'))).toBe(30);
  });

  it('never returns less than 1, even against a future start', () => {
    expect(rentalDayNumber(ist('2026-09-03').toISOString(), ist('2026-08-31'))).toBe(1);
  });

  it('returns 0 on an unparseable date so callers can skip the row', () => {
    expect(rentalDayNumber('not-a-date')).toBe(0);
  });

  it('an N-day plan ends on Day N', () => {
    // Started IST day 1, checked on the last IST day of a 30-day plan.
    expect(rentalDayNumber(ist('2026-08-02', '09:00').toISOString(), ist('2026-08-31', '23:00'))).toBe(30);
  });
});

describe('describeExpiry', () => {
  const now = ist('2026-08-31', '12:00');

  it('is null when the rental has no plan to expire', () => {
    expect(describeExpiry(null)).toBeNull();
  });

  it('is null on an unparseable date rather than guessing', () => {
    expect(describeExpiry('not-a-date')).toBeNull();
  });

  it('stays neutral while the plan has room left', () => {
    const d = describeExpiry(endOfIstDay('2026-09-04'), now); // 4 days out
    expect(d?.tone).toBe('neutral');
    expect(d?.daysLeft).toBe(4);
    expect(d?.text).toContain('4 days left');
  });

  it('warns from the threshold day onward', () => {
    expect(describeExpiry(endOfIstDay('2026-09-03'), now)?.tone).toBe('warning'); // EXPIRY_WARNING_DAYS out
    expect(describeExpiry(endOfIstDay('2026-09-01'), now)?.tone).toBe('warning');
  });

  it('singularises the last full day', () => {
    const d = describeExpiry(endOfIstDay('2026-09-01'), now);
    expect(d?.text).toContain('1 day left');
    expect(d?.headline).toBe('Your plan ends in 1 day.');
  });

  it('treats the expiry day itself as danger, not warning', () => {
    const d = describeExpiry(endOfIstDay('2026-08-31'), ist('2026-08-31', '09:00'));
    expect(d?.tone).toBe('danger');
    expect(d?.daysLeft).toBe(0);
    expect(d?.text).toContain('last day');
  });

  it('reports how far past expiry a rider is', () => {
    const d = describeExpiry(endOfIstDay('2026-08-28'), now);
    expect(d?.tone).toBe('danger');
    expect(d?.daysLeft).toBe(-3);
    expect(d?.text).toBe('Expired 3 days ago');
    expect(d?.headline).toBe('Your plan expired 3 days ago.');
  });

  it('singularises a one-day overrun', () => {
    expect(describeExpiry(endOfIstDay('2026-08-30'), now)?.text).toBe('Expired 1 day ago');
  });

  it('exposes the warning threshold', () => {
    expect(EXPIRY_WARNING_DAYS).toBe(3);
  });
});
