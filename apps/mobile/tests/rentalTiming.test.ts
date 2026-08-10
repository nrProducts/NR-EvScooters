import { describe, expect, it } from 'vitest';
import { EXPIRY_WARNING_DAYS, describeExpiry, rentalDayNumber } from '../src/lib/rentalTiming';
import { planExpiryFor } from '../src/lib/returnPolicy';

/**
 * Local-date construction throughout (NOT toISOString, which is UTC-based and
 * can land on the wrong calendar day depending on the runner's offset) —
 * matches how these functions do their day math.
 */
const at = (offsetDays: number, h = 12): Date => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(h, 0, 0, 0);
  return d;
};

/** rentals.expires_at as the server would have written it, `offsetDays` out. */
const expiresIn = (offsetDays: number): string => {
  const d = at(offsetDays);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
};

describe('rentalDayNumber', () => {
  it('calls the pickup day Day 1', () => {
    expect(rentalDayNumber(at(0, 9).toISOString(), at(0, 18))).toBe(1);
  });

  it('rolls to Day 2 the next calendar day, not 24 hours later', () => {
    expect(rentalDayNumber(at(0, 23).toISOString(), at(1, 1))).toBe(2);
  });

  it('counts across a month', () => {
    expect(rentalDayNumber(at(-29, 9).toISOString(), at(0, 9))).toBe(30);
  });

  it('never returns less than 1, even against a future start', () => {
    expect(rentalDayNumber(at(3).toISOString(), at(0))).toBe(1);
  });

  it('returns 0 on an unparseable date so callers can skip the row', () => {
    expect(rentalDayNumber('not-a-date')).toBe(0);
  });

  it('lines up with planExpiryFor: an N-day plan ends on Day N', () => {
    const started = at(0, 9);
    const expires = planExpiryFor(started, 30);
    expect(rentalDayNumber(started.toISOString(), expires)).toBe(30);
  });
});

describe('describeExpiry', () => {
  it('is null when the rental has no plan to expire', () => {
    expect(describeExpiry(null)).toBeNull();
  });

  it('is null on an unparseable date rather than guessing', () => {
    expect(describeExpiry('not-a-date')).toBeNull();
  });

  it('stays neutral while the plan has room left', () => {
    const d = describeExpiry(expiresIn(EXPIRY_WARNING_DAYS + 1), at(0));
    expect(d?.tone).toBe('neutral');
    expect(d?.daysLeft).toBe(EXPIRY_WARNING_DAYS + 1);
    expect(d?.text).toContain(`${EXPIRY_WARNING_DAYS + 1} days left`);
  });

  it('warns from the threshold day onward', () => {
    expect(describeExpiry(expiresIn(EXPIRY_WARNING_DAYS), at(0))?.tone).toBe('warning');
    expect(describeExpiry(expiresIn(1), at(0))?.tone).toBe('warning');
  });

  it('singularises the last full day', () => {
    const d = describeExpiry(expiresIn(1), at(0));
    expect(d?.text).toContain('1 day left');
    expect(d?.headline).toBe('Your plan ends in 1 day.');
  });

  it('treats the expiry day itself as danger, not warning', () => {
    const d = describeExpiry(expiresIn(0), at(0, 9));
    expect(d?.tone).toBe('danger');
    expect(d?.daysLeft).toBe(0);
    expect(d?.text).toContain('last day');
  });

  it('reports how far past expiry a rider is', () => {
    const d = describeExpiry(expiresIn(-3), at(0));
    expect(d?.tone).toBe('danger');
    expect(d?.daysLeft).toBe(-3);
    expect(d?.text).toBe('Expired 3 days ago');
    expect(d?.headline).toBe('Your plan expired 3 days ago.');
  });

  it('singularises a one-day overrun', () => {
    expect(describeExpiry(expiresIn(-1), at(0))?.text).toBe('Expired 1 day ago');
  });
});
