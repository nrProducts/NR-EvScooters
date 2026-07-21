import { describe, expect, it } from 'vitest';
import { rentGateDecision } from '../src/lib/rentGate';

describe('rentGateDecision', () => {
  it('points a not_submitted rider to start KYC', () => {
    const d = rentGateDecision('not_submitted');
    expect(d.ctaLabel).toBe('Start KYC');
    expect(d.message).toMatch(/verified identity/i);
  });

  it('tells a rejected rider to fix and resubmit', () => {
    const d = rentGateDecision('rejected');
    expect(d.message).toMatch(/rejected/i);
    expect(d.ctaLabel).toBe('View KYC status');
  });

  it('tells a pending or partially_verified rider it is under review', () => {
    expect(rentGateDecision('pending').message).toMatch(/review/i);
    expect(rentGateDecision('partially_verified').message).toMatch(/review/i);
  });
});
