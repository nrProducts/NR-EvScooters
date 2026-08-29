import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CANCELLATION_TIERS, BEYOND_LAST_TIER_PENALTY_PERCENT,
  computeCancellationCharge, describeElapsed,
} from '../src/lib/cancellationPolicy';

/**
 * Deliberately mirrors apps/backend/tests/bookingCancellation.test.ts. The
 * mobile copy of the rule only exists so the rider can be shown an estimate
 * before confirming; if the two drift, one of these suites fails.
 */

const createdMinutesAgo = (minutesAgo: number, now: Date): string =>
  new Date(now.getTime() - minutesAgo * 60_000).toISOString();

describe('computeCancellationCharge — tier resolution (defaults 30→25%, 60→50%)', () => {
  const now = new Date('2026-08-29T12:00:00Z');

  it('keeps 25% inside the first tier (10 min after booking)', () => {
    const c = computeCancellationCharge({
      planPaid: 1000, depositAmount: 2000, createdAt: createdMinutesAgo(10, now), now,
    });
    expect(c.penaltyPercent).toBe(25);
    expect(c.penaltyAmount).toBe(250);
    expect(c.depositRefund).toBe(2000);
    expect(c.refundAmount).toBe(2750);
  });

  it('keeps 25% exactly at the boundary (30 min)', () => {
    expect(computeCancellationCharge({ planPaid: 1000, createdAt: createdMinutesAgo(30, now), now }).penaltyPercent)
      .toBe(25);
  });

  it('keeps 50% in the second tier (45 min)', () => {
    const c = computeCancellationCharge({ planPaid: 1000, createdAt: createdMinutesAgo(45, now), now });
    expect(c.penaltyPercent).toBe(50);
    expect(c.penaltyAmount).toBe(500);
  });

  it('keeps 100% past every tier (90 min) — deposit still returned', () => {
    const c = computeCancellationCharge({
      planPaid: 1000, depositAmount: 2000, createdAt: createdMinutesAgo(90, now), now,
    });
    expect(c.penaltyPercent).toBe(BEYOND_LAST_TIER_PENALTY_PERCENT);
    expect(c.refundAmount).toBe(2000);
  });
});

describe('computeCancellationCharge — edge cases', () => {
  const now = new Date('2026-08-29T12:00:00Z');

  it('treats an unknown created_at as 0 elapsed', () => {
    const c = computeCancellationCharge({ planPaid: 1000, now });
    expect(c.elapsedMinutes).toBe(0);
    expect(c.penaltyPercent).toBe(25);
  });

  it('does not push into a worse tier on a future-dated created_at', () => {
    const c = computeCancellationCharge({
      planPaid: 1000, createdAt: new Date(now.getTime() + 5 * 60_000).toISOString(), now,
    });
    expect(c.elapsedMinutes).toBe(0);
  });

  it('treats a missing planPaid as zero rather than NaN', () => {
    const c = computeCancellationCharge({ planPaid: null, createdAt: createdMinutesAgo(90, now), now });
    expect(c.planPaid).toBe(0);
    expect(c.refundAmount).toBe(0);
  });

  it('never returns a negative refund', () => {
    const c = computeCancellationCharge({ planPaid: -50, depositAmount: -10, createdAt: createdMinutesAgo(90, now), now });
    expect(c.refundAmount).toBeGreaterThanOrEqual(0);
  });

  it('rounds to 2dp without float dust', () => {
    const c = computeCancellationCharge({ planPaid: 999.99, createdAt: createdMinutesAgo(10, now), now });
    expect(c.penaltyAmount).toBe(250);
    expect(c.refundAmount).toBe(749.99);
  });

  it('accepts a custom tier list', () => {
    const c = computeCancellationCharge({
      planPaid: 1000, createdAt: createdMinutesAgo(3, now), now,
      tiers: [{ upto_minutes: 5, penalty_percent: 0 }, { upto_minutes: 10, penalty_percent: 40 }],
    });
    expect(c.penaltyPercent).toBe(0);
    expect(c.refundAmount).toBe(1000);
  });
});

describe('DEFAULT_CANCELLATION_TIERS mirror', () => {
  it('matches the shipped backend fallback', () => {
    expect(DEFAULT_CANCELLATION_TIERS).toEqual([
      { upto_minutes: 30, penalty_percent: 25 },
      { upto_minutes: 60, penalty_percent: 50 },
    ]);
  });
});

describe('describeElapsed', () => {
  it('phrases the wait', () => {
    expect(describeElapsed(0)).toBe('just now');
    expect(describeElapsed(20)).toBe('20 min ago');
    expect(describeElapsed(90)).toBe('1 hour ago');
    expect(describeElapsed(60 * 26)).toBe('1 day ago');
  });
});
