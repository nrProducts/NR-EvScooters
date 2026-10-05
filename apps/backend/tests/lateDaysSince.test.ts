import { describe, expect, it } from "vitest";
import { lateDaysSince } from "../src/modules/payments/renewalFee";

/**
 * `lateDaysSince` is the pure date-math core `computeLateRenewalFee` calls —
 * shared, unchanged, by both a late renewal (payments.service.ts,
 * bookings.service.ts's requestEarlyRecharge) and a late return
 * (rentals/overdueLateFee.ts's previewOverdueLateFee). There is exactly one
 * implementation of "how late is this," so testing it here is testing both
 * exits at once — see overdueLateFee.test.ts's "keeps the renewal pair
 * identical to the return pair" for the same invariant exercised through the
 * return path's own async wrapper.
 *
 * The rule: at or before the due instant is on time. The instant it passes —
 * even by a second — the rider owes at least one day's fee, not a free
 * 24-hour grace window. Each additional full (or partial) 24-hour block adds
 * one more day (Math.ceil, not floor).
 *
 * All instants are written with an explicit UTC offset so the test's result
 * cannot depend on the machine/CI runner's own timezone — exactly the
 * "compare timestamps, never local date strings" rule this fix exists to
 * enforce two levels up (computeLateRenewalFee anchors dueDate at noon IST
 * via noonOfBusinessDay, never at local midnight).
 */

const DUE = new Date("2026-10-02T12:00:00+05:30"); // Oct 2, 12:00 PM IST

describe("lateDaysSince — the exact boundary table", () => {
    it.each([
        ["Oct 2 11:59 AM (1 minute early)", "2026-10-02T11:59:00+05:30", 0, false],
        ["Oct 2 12:00 PM (exactly on time)", "2026-10-02T12:00:00+05:30", 0, false],
        ["Oct 2 12:01 PM (1 minute late)", "2026-10-02T12:01:00+05:30", 1, true],
        ["Oct 2 6:00 PM (6 hours late)", "2026-10-02T18:00:00+05:30", 1, true],
        ["Oct 3 11:59 AM (23h59m late)", "2026-10-03T11:59:00+05:30", 1, true],
        ["Oct 3 12:00 PM (exactly 24h late)", "2026-10-03T12:00:00+05:30", 1, true],
        ["Oct 3 12:01 PM (24h1m late)", "2026-10-03T12:01:00+05:30", 2, true],
        ["Oct 4 12:01 PM (48h1m late)", "2026-10-04T12:01:00+05:30", 3, true],
    ] as const)("%s => %d late day(s)", (_label, nowIso, expectedDays, expectedLate) => {
        const result = lateDaysSince(DUE, new Date(nowIso));
        expect(result.isLate).toBe(expectedLate);
        expect(result.daysLate).toBe(expectedDays);
    });
});

describe("lateDaysSince — edge cases", () => {
    it("is not late exactly at the due instant", () => {
        expect(lateDaysSince(DUE, DUE)).toEqual({ isLate: false, daysLate: 0, hoursLate: 0 });
    });

    it("is late by one full day one second after the due instant", () => {
        const oneSecondLate = new Date(DUE.getTime() + 1000);
        const result = lateDaysSince(DUE, oneSecondLate);
        expect(result.isLate).toBe(true);
        expect(result.daysLate).toBe(1);
        expect(result.hoursLate).toBeCloseTo(1 / 3600, 5);
    });

    it("stays at one day exactly at the 24-hour mark", () => {
        const exactly24h = new Date(DUE.getTime() + 24 * 60 * 60 * 1000);
        const result = lateDaysSince(DUE, exactly24h);
        expect(result.daysLate).toBe(1);
        expect(result.hoursLate).toBe(24);
    });

    it("becomes two days one second after the 24-hour mark", () => {
        const justOver24h = new Date(DUE.getTime() + 24 * 60 * 60 * 1000 + 1000);
        const result = lateDaysSince(DUE, justOver24h);
        expect(result.daysLate).toBe(2);
    });

    it("keeps growing by one day per 24-hour block for multi-day lateness", () => {
        for (const days of [4, 10, 30, 365]) {
            const at = new Date(DUE.getTime() + days * 24 * 60 * 60 * 1000 + 1000);
            expect(lateDaysSince(DUE, at).daysLate).toBe(days + 1);
        }
    });

    it("reports 0/not-late for an invalid due date rather than NaN", () => {
        const invalid = new Date("not-a-real-date");
        expect(lateDaysSince(invalid, new Date("2026-10-05T00:00:00+05:30")))
            .toEqual({ isLate: false, daysLate: 0, hoursLate: 0 });
    });

    it("is never negative when `now` is somehow before `dueAt`", () => {
        const before = new Date(DUE.getTime() - 60_000);
        const result = lateDaysSince(DUE, before);
        expect(result).toEqual({ isLate: false, daysLate: 0, hoursLate: 0 });
    });

    it("defaults `now` to the current instant when omitted", () => {
        // A due date far in the past against the REAL current clock — proves
        // the parameter is genuinely optional, not just typed that way.
        const longAgo = new Date("2000-01-01T12:00:00+05:30");
        const result = lateDaysSince(longAgo);
        expect(result.isLate).toBe(true);
        expect(result.daysLate).toBeGreaterThan(1000);
    });

    /**
     * Same absolute instants as the boundary table above, expressed in UTC
     * instead of IST, to prove the comparison is instant-vs-instant (Date
     * objects), never a local calendar-date string comparison that would
     * silently pick up the test runner's own timezone.
     */
    it("agrees with the IST boundary table when the same instants are written in UTC", () => {
        // Oct 2 12:01 PM IST === Oct 2 06:31 AM UTC.
        const oneMinuteLateUtc = new Date("2026-10-02T06:31:00Z");
        expect(lateDaysSince(DUE, oneMinuteLateUtc)).toEqual({
            isLate: true, daysLate: 1, hoursLate: 1 / 60,
        });

        // Oct 3 12:01 PM IST === Oct 3 06:31 AM UTC.
        const twoDaysLateUtc = new Date("2026-10-03T06:31:00Z");
        const result = lateDaysSince(DUE, twoDaysLateUtc);
        expect(result.isLate).toBe(true);
        expect(result.daysLate).toBe(2);
    });
});
