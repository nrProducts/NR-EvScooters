import { describe, expect, it } from 'vitest';
import { getRenewalEligibility, hasPassedCutover } from '../src/lib/returnPolicy';

describe('hasPassedCutover — the noon-instant check, not a calendar-day one', () => {
  it('is false right up to the cutover instant itself (AT noon is still on time)', () => {
    expect(hasPassedCutover('2026-10-11', new Date('2026-10-11T06:30:00.000Z'))).toBe(false);
  });

  it('is true the instant after noon on the due date', () => {
    // This is the case a calendar-day comparison always got wrong: "today"
    // still equals the due date all the way until midnight, so the old
    // check stayed false for ~12 hours after the plan had actually lapsed.
    expect(hasPassedCutover('2026-10-11', new Date('2026-10-11T06:30:00.001Z'))).toBe(true);
    expect(hasPassedCutover('2026-10-11', new Date('2026-10-11T08:02:05.000Z'))).toBe(true); // 1:32 PM IST
  });

  it('is false any time before noon on the due date', () => {
    expect(hasPassedCutover('2026-10-11', new Date('2026-10-11T00:00:00.000Z'))).toBe(false); // 5:30 AM IST
  });
});

describe('getRenewalEligibility — isLate', () => {
  it('is NOT late before noon on the due date, even though the Renew button is already offered', () => {
    const now = new Date('2026-10-11T00:00:00.000Z'); // 5:30 AM IST, due date itself
    const r = getRenewalEligibility('active', '2026-10-11', 'none', now);
    expect(r.canRenew).toBe(true); // available from the start of the due day
    expect(r.isLate).toBe(false); // but not late until noon passes
  });

  it('turns late the instant noon passes on the due date, not the next calendar day', () => {
    const now = new Date('2026-10-11T08:02:05.000Z'); // 1:32 PM IST
    const r = getRenewalEligibility('active', '2026-10-11', 'none', now);
    expect(r.canRenew).toBe(true);
    expect(r.isLate).toBe(true);
  });
});
