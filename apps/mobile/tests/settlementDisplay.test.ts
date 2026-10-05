import { describe, expect, it } from 'vitest';
import {
  isAmountDueSettlement, isRefundSettlement, isTerminalSettlement,
  shouldShowRefundInBilling, shouldShowSettlement,
} from '../src/lib/settlementDisplay';
import type { ApiReturnSettlement } from '../src/types/api';

const HOUR = 60 * 60 * 1000;

const settlement = (over: Partial<ApiReturnSettlement>): ApiReturnSettlement => ({
  status: 'pending_refund',
  refund_amount: 2000,
  due_amount: 0,
  processed_at: null,
  ...over,
} as ApiReturnSettlement);

describe('isAmountDueSettlement', () => {
  it('is true only when money is owed AND the status agrees', () => {
    expect(isAmountDueSettlement(settlement({ status: 'amount_due', due_amount: 500, refund_amount: 0 }))).toBe(true);
    // A due_amount left over on an already-settled row is not a live debt.
    expect(isAmountDueSettlement(settlement({ status: 'settlement_completed', due_amount: 500 }))).toBe(false);
    expect(isAmountDueSettlement(null)).toBe(false);
  });
});

describe('isRefundSettlement', () => {
  it('is true whatever stage the refund is at', () => {
    for (const status of ['pending_refund', 'refund_processing', 'refund_completed'] as const) {
      expect(isRefundSettlement(settlement({ status }))).toBe(true);
    }
  });

  it('is false when there is nothing to refund', () => {
    expect(isRefundSettlement(settlement({ status: 'no_refund_required', refund_amount: 0 }))).toBe(false);
    expect(isRefundSettlement(settlement({ status: 'amount_due', refund_amount: 0, due_amount: 500 }))).toBe(false);
    expect(isRefundSettlement(null)).toBe(false);
  });
});

describe('shouldShowRefundInBilling', () => {
  it('keeps an unresolved refund on Billing indefinitely', () => {
    // The 48h display window deliberately does NOT apply here — a refund
    // that has not landed is still the rider's open question two weeks on.
    const stale = settlement({ status: 'pending_refund', processed_at: new Date(Date.now() - 500 * HOUR).toISOString() });
    expect(shouldShowSettlement(stale)).toBe(true); // not terminal, so this agrees
    expect(shouldShowRefundInBilling(stale)).toBe(true);
    expect(shouldShowRefundInBilling(settlement({ status: 'refund_processing' }))).toBe(true);
  });

  it('keeps a completed refund only for the confirmation window', () => {
    const justNow = settlement({ status: 'refund_completed', processed_at: new Date().toISOString() });
    const longAgo = settlement({ status: 'refund_completed', processed_at: new Date(Date.now() - 72 * HOUR).toISOString() });
    expect(shouldShowRefundInBilling(justNow)).toBe(true);
    expect(shouldShowRefundInBilling(longAgo)).toBe(false);
  });

  it('never shows the amount-due variant — that card belongs to My Scooter', () => {
    expect(shouldShowRefundInBilling(
      settlement({ status: 'amount_due', due_amount: 500, refund_amount: 0 }),
    )).toBe(false);
  });

  it('is false when nothing was owed either way', () => {
    expect(shouldShowRefundInBilling(settlement({ status: 'no_refund_required', refund_amount: 0 }))).toBe(false);
    expect(shouldShowRefundInBilling(null)).toBe(false);
  });
});

describe('isTerminalSettlement', () => {
  it('treats only the finished states as terminal', () => {
    expect(isTerminalSettlement('refund_completed')).toBe(true);
    expect(isTerminalSettlement('settlement_completed')).toBe(true);
    expect(isTerminalSettlement('no_refund_required')).toBe(true);
    expect(isTerminalSettlement('pending_refund')).toBe(false);
    expect(isTerminalSettlement('refund_processing')).toBe(false);
    expect(isTerminalSettlement('amount_due')).toBe(false);
  });
});
