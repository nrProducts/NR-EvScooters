import { describe, expect, it } from 'vitest';
import {
  FREE_CANCELLATION_GRACE_MINUTES, FREE_CANCELLATION_NOTICE_DAYS, LATE_CANCELLATION_PENALTY_RATE,
  computeCancellationCharge, describePickupTiming,
} from '../src/lib/cancellationPolicy';

/**
 * Deliberately the SAME fixture table as
 * apps/backend/tests/bookingCancellation.test.ts. The mobile copy of the rule
 * only exists so the rider can be shown the fee before confirming; if the two
 * ever drift, one of these suites fails.
 */

const fmt = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const dayOffset = (offset: number): string => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return fmt(d);
};

describe('computeCancellationCharge — free/late boundary', () => {
  it('is free exactly at the notice boundary (start_day = today + 2)', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(FREE_CANCELLATION_NOTICE_DAYS), planPrice: 4000 });
    expect(c.daysUntilPickup).toBe(2);
    expect(c.isLate).toBe(false);
    expect(c.penaltyAmount).toBe(0);
    expect(c.refundAmount).toBe(4000);
  });

  it('charges a penalty one day inside the boundary (pickup tomorrow)', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 4000 });
    expect(c.daysUntilPickup).toBe(1);
    expect(c.isLate).toBe(true);
    expect(c.penaltyAmount).toBe(1000);
    expect(c.refundAmount).toBe(3000);
  });

  it('treats a pickup today as late', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(0), planPrice: 4000 });
    expect(c.daysUntilPickup).toBe(0);
    expect(c.isLate).toBe(true);
  });

  it('treats an already-passed pickup as late, with a negative day count', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(-1), planPrice: 4000 });
    expect(c.daysUntilPickup).toBe(-1);
    expect(c.isLate).toBe(true);
  });

  it('is free far in advance', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(30), planPrice: 4000 });
    expect(c.isLate).toBe(false);
    expect(c.refundAmount).toBe(4000);
  });

  it('is day-based, not clock-based — late evening on day -2 is still free', () => {
    const c = computeCancellationCharge({
      startDay: '2026-08-03',
      planPrice: 4000,
      now: new Date('2026-08-01T23:30:00'),
    });
    expect(c.daysUntilPickup).toBe(2);
    expect(c.isLate).toBe(false);
  });
});

describe('computeCancellationCharge — post-creation grace period', () => {
  it('is free when a booking for tomorrow is cancelled minutes after creation', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 14 * 60_000).toISOString();

    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 799, createdAt, now });
    expect(c.withinGrace).toBe(true);
    expect(c.isLate).toBe(false);
    expect(c.penaltyAmount).toBe(0);
    expect(c.refundAmount).toBe(799);
  });

  it('is still free one minute inside the window', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - (FREE_CANCELLATION_GRACE_MINUTES - 1) * 60_000).toISOString();
    expect(computeCancellationCharge({ startDay: dayOffset(0), planPrice: 4000, createdAt, now }).penaltyAmount)
      .toBe(0);
  });

  it('charges once the window has passed', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - (FREE_CANCELLATION_GRACE_MINUTES + 1) * 60_000).toISOString();

    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 4000, createdAt, now });
    expect(c.withinGrace).toBe(false);
    expect(c.penaltyAmount).toBe(1000);
  });

  it('does not resurrect the grace window on a future-dated created_at', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() + 5 * 60 * 60_000).toISOString();
    expect(computeCancellationCharge({ startDay: dayOffset(1), planPrice: 4000, createdAt, now }).withinGrace)
      .toBe(false);
  });

  it('falls back to the notice rule when created_at is unknown', () => {
    expect(computeCancellationCharge({ startDay: dayOffset(1), planPrice: 4000 }).isLate).toBe(true);
    expect(computeCancellationCharge({ startDay: dayOffset(5), planPrice: 4000 }).isLate).toBe(false);
  });
});

describe('computeCancellationCharge — amounts', () => {
  it('charges the penalty on the net price, after any referral discount', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 4000, discountAmount: 100 });
    expect(c.chargeableAmount).toBe(3900);
    expect(c.penaltyAmount).toBe(975);
    expect(c.refundAmount).toBe(2925);
  });

  it('rounds to 2dp without float dust', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 999.99 });
    expect(c.penaltyAmount).toBe(250);
    expect(c.refundAmount).toBe(749.99);
  });

  it('treats a missing plan price as zero rather than NaN', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: null });
    expect(c.chargeableAmount).toBe(0);
    expect(c.refundAmount).toBe(0);
  });

  it('clamps to zero when the discount exceeds the plan price — never negative', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(1), planPrice: 100, discountAmount: 500 });
    expect(c.chargeableAmount).toBe(0);
    expect(c.refundAmount).toBe(0);
  });

  it('applies the configured rate', () => {
    const c = computeCancellationCharge({ startDay: dayOffset(0), planPrice: 1000 });
    expect(c.penaltyAmount).toBe(1000 * LATE_CANCELLATION_PENALTY_RATE);
  });
});

describe('describePickupTiming', () => {
  it('reads naturally in the confirmation dialog', () => {
    expect(describePickupTiming(-1)).toBe('already past');
    expect(describePickupTiming(0)).toBe('today');
    expect(describePickupTiming(1)).toBe('tomorrow');
    expect(describePickupTiming(5)).toBe('in 5 days');
  });
});
