import { describe, expect, it } from "vitest";
import { addDays, calculateRentalPeriod, describeHoursLate, noonOfBusinessDay } from "../src/common/dates";

describe("addDays", () => {
    it("adds whole days within a month", () => {
        expect(addDays("2026-08-10", 7)).toBe("2026-08-17");
    });

    it("rolls over a month boundary", () => {
        expect(addDays("2026-08-28", 7)).toBe("2026-09-04");
    });

    it("rolls over a year boundary", () => {
        expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    });

    it("is stable across a DST transition (no day drift)", () => {
        // 2026-03-08 is the US DST spring-forward date; this must still land
        // exactly 7 calendar days later, not 6 or 8, regardless of the test
        // runner's local timezone — the whole point of anchoring in UTC.
        expect(addDays("2026-03-08", 7)).toBe("2026-03-15");
    });

    it("matches the spec's worked maintenance-pause example (10 -> 17 Aug, 7-day plan)", () => {
        expect(addDays("2026-08-10", 7)).toBe("2026-08-17");
        // 3 days paused, resumed 16 Aug -> due date shifts from 17 to 20 Aug.
        expect(addDays("2026-08-17", 3)).toBe("2026-08-20");
    });
});

describe("noonOfBusinessDay", () => {
    it("is exactly 12:00:00 IST on the given date", () => {
        expect(noonOfBusinessDay("2026-09-20")).toBe("2026-09-20T12:00:00+05:30");
    });
});

describe("calculateRentalPeriod — the single rental-cycle calculation", () => {
    it("matches the spec's own worked example: 7-day plan, 20 Sep -> 27 Sep, both at noon", () => {
        const period = calculateRentalPeriod("2026-09-20", 7);
        expect(period.startDate).toBe("2026-09-20");
        expect(period.endDate).toBe("2026-09-27");
        expect(period.startAt).toBe("2026-09-20T12:00:00+05:30");
        expect(period.endAt).toBe("2026-09-27T12:00:00+05:30");
    });

    it("a 1-day (daily) plan runs exactly 24 hours, noon to noon", () => {
        const period = calculateRentalPeriod("2026-09-20", 1);
        expect(period.endDate).toBe("2026-09-21");
        expect(period.endAt).toBe("2026-09-21T12:00:00+05:30");
    });

    it("a 14-day plan matches the spec's example (20 Sep -> 4 Oct)", () => {
        expect(calculateRentalPeriod("2026-09-20", 14).endDate).toBe("2026-10-04");
    });

    it("a 28-day plan matches the spec's example (20 Sep -> 18 Oct)", () => {
        expect(calculateRentalPeriod("2026-09-20", 28).endDate).toBe("2026-10-18");
    });

    it("chains a renewal from the previous period's own end date, not from today", () => {
        // Week 1: 20 Sep 12pm -> 27 Sep 12pm. Week 2 must start exactly where
        // week 1 ended — same calendar date, same noon instant — never from
        // whatever day the renewal payment actually happens to land on.
        const week1 = calculateRentalPeriod("2026-09-20", 7);
        const week2 = calculateRentalPeriod(week1.endDate, 7);
        expect(week2.startAt).toBe(week1.endAt);
        expect(week2.endDate).toBe("2026-10-04");

        const week3 = calculateRentalPeriod(week2.endDate, 7);
        expect(week3.startDate).toBe("2026-10-04");
        expect(week3.endDate).toBe("2026-10-11");
    });
});

describe("describeHoursLate", () => {
    it("matches the spec's own example: 30 minutes late", () => {
        expect(describeHoursLate(0.5)).toBe("30 minutes late");
    });

    it("describes whole hours under a day", () => {
        expect(describeHoursLate(3)).toBe("3 hours late");
        expect(describeHoursLate(1)).toBe("1 hour late");
    });

    it("describes days plus a remaining whole hour", () => {
        expect(describeHoursLate(27)).toBe("1 day 3 hours late");
    });

    it("describes an exact whole number of days with no hour remainder", () => {
        expect(describeHoursLate(48)).toBe("2 days late");
    });
});
