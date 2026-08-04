import { describe, expect, it } from "vitest";
import {
    computeLateReturnPenalty, effectiveDueAt, planExpiryFor, returnDeadlineFor,
} from "../src/modules/rentals/rentals.service";
import {
    LATE_RETURN_FEE_PER_DAY, MAX_LATE_PENALTY_DAYS,
} from "../src/modules/rentals/returnPolicy.constants";

/**
 * Local-date construction throughout (NOT toISOString, which is UTC-based and
 * can land on the wrong calendar day depending on the runner's offset) —
 * matches how computeLateReturnPenalty does its day math.
 */
const at = (offsetDays: number, h = 12, m = 0, s = 0, ms = 0): Date => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    d.setHours(h, m, s, ms);
    return d;
};

/** The deadline a request submitted `offsetDays` from today would carry. */
const dueAt = (offsetDays: number): string => returnDeadlineFor(at(offsetDays)).toISOString();

describe("returnDeadlineFor", () => {
    it("lands on the last millisecond of the same local day", () => {
        const due = returnDeadlineFor(at(0, 9, 30));
        expect(due.getHours()).toBe(23);
        expect(due.getMinutes()).toBe(59);
        expect(due.getSeconds()).toBe(59);
        expect(due.getMilliseconds()).toBe(999);
    });

    it("is the same instant whether requested at midnight or just before midnight", () => {
        expect(returnDeadlineFor(at(0, 0, 0, 0, 0)).getTime())
            .toBe(returnDeadlineFor(at(0, 23, 59, 59, 0)).getTime());
    });
});

describe("computeLateReturnPenalty — on time", () => {
    it("is free when handed over in the morning of the due day", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(0, 9) });
        expect(c.daysLate).toBe(0);
        expect(c.isLate).toBe(false);
        expect(c.penaltyAmount).toBe(0);
        expect(c.hadDeadline).toBe(true);
    });

    it("is free right up to the last second of the due day", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(0, 23, 59, 59) });
        expect(c.daysLate).toBe(0);
        expect(c.penaltyAmount).toBe(0);
    });

    it("never goes negative when the handover precedes the deadline", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(1), now: at(0, 12) });
        expect(c.daysLate).toBe(0);
        expect(c.penaltyAmount).toBe(0);
    });
});

describe("computeLateReturnPenalty — late", () => {
    it("charges one day the moment the clock rolls past midnight", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(1, 0, 0, 30) });
        expect(c.daysLate).toBe(1);
        expect(c.isLate).toBe(true);
        expect(c.penaltyAmount).toBe(LATE_RETURN_FEE_PER_DAY);
    });

    it("still charges exactly one day late that same evening", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(1, 23) });
        expect(c.daysLate).toBe(1);
        expect(c.penaltyAmount).toBe(LATE_RETURN_FEE_PER_DAY);
    });

    it("scales with whole days late", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(2, 8) });
        expect(c.daysLate).toBe(2);
        expect(c.penaltyAmount).toBe(2 * LATE_RETURN_FEE_PER_DAY);
    });

    it("caps an abandoned rental rather than accruing without bound", () => {
        const c = computeLateReturnPenalty({ returnDueAt: dueAt(0), now: at(365) });
        expect(c.daysLate).toBe(MAX_LATE_PENALTY_DAYS);
        expect(c.penaltyAmount).toBe(MAX_LATE_PENALTY_DAYS * LATE_RETURN_FEE_PER_DAY);
    });
});

describe("computeLateReturnPenalty — no deadline to be late against", () => {
    it("charges nothing when a rental had neither a return request nor a plan expiry", () => {
        const c = computeLateReturnPenalty({ returnDueAt: null, now: at(30) });
        expect(c.hadDeadline).toBe(false);
        expect(c.daysLate).toBe(0);
        expect(c.isLate).toBe(false);
        expect(c.penaltyAmount).toBe(0);
    });

    it("fails open on an unparseable deadline rather than charging", () => {
        const c = computeLateReturnPenalty({ returnDueAt: "not-a-date", now: at(30) });
        expect(c.hadDeadline).toBe(false);
        expect(c.penaltyAmount).toBe(0);
    });

    it("always reports the fee in force, even at zero charge", () => {
        expect(computeLateReturnPenalty({ returnDueAt: null }).feePerDay).toBe(LATE_RETURN_FEE_PER_DAY);
    });
});

describe("planExpiryFor", () => {
    it("counts the pickup day as day 1, so a 1-day plan ends that same evening", () => {
        const expires = planExpiryFor(at(0, 9), 1);
        expect(expires.getTime()).toBe(returnDeadlineFor(at(0)).getTime());
    });

    it("ends a 30-day plan on day 30, not day 31", () => {
        const expires = planExpiryFor(at(0, 9), 30);
        expect(expires.getTime()).toBe(returnDeadlineFor(at(29)).getTime());
    });

    it("lands on the last millisecond of the expiry day", () => {
        const expires = planExpiryFor(at(0, 9), 7);
        expect(expires.getHours()).toBe(23);
        expect(expires.getMilliseconds()).toBe(999);
    });

    it("rolls month and year boundaries", () => {
        // Jan 31 + a 30-day plan -> Mar 1 (Jan 31 is day 1, so 29 days added).
        const jan31 = new Date(2027, 0, 31, 9, 0, 0, 0);
        const expires = planExpiryFor(jan31, 30);
        expect(expires.getMonth()).toBe(2);
        expect(expires.getDate()).toBe(1);
    });
});

describe("effectiveDueAt", () => {
    it("falls back to the plan's expiry when the rider never requested a return", () => {
        const expires = dueAt(5);
        expect(effectiveDueAt({ return_due_at: null, expires_at: expires })).toBe(expires);
    });

    it("prefers an early return request over the plan's expiry", () => {
        const requested = dueAt(0);
        expect(effectiveDueAt({ return_due_at: requested, expires_at: dueAt(20) })).toBe(requested);
    });

    it("is null only when the rental had no deadline at all", () => {
        expect(effectiveDueAt({ return_due_at: null, expires_at: null })).toBeNull();
    });
});

/**
 * The behaviour this whole feature exists for: before 20260804100000 a rider
 * who simply never requested a return was never late, because return_due_at
 * was the only deadline and it stayed null.
 */
describe("plan overrun settles like a late return", () => {
    it("charges a rider who sat past their plan without ever requesting a return", () => {
        const rental = { return_due_at: null, expires_at: dueAt(-3) };
        const c = computeLateReturnPenalty({ returnDueAt: effectiveDueAt(rental), now: at(0, 10) });
        expect(c.hadDeadline).toBe(true);
        expect(c.daysLate).toBe(3);
        expect(c.penaltyAmount).toBe(3 * LATE_RETURN_FEE_PER_DAY);
    });

    it("charges nothing while the plan is still running", () => {
        const rental = { return_due_at: null, expires_at: dueAt(4) };
        const c = computeLateReturnPenalty({ returnDueAt: effectiveDueAt(rental), now: at(0, 10) });
        expect(c.daysLate).toBe(0);
        expect(c.penaltyAmount).toBe(0);
    });

    it("keeps the accrued overrun when a late rider finally requests a return", () => {
        // requestReturn clamps return_due_at to expires_at rather than writing
        // today's end-of-day, which would otherwise erase the 3 days owed.
        const expiresAt = dueAt(-3);
        const clamped = effectiveDueAt({ return_due_at: expiresAt, expires_at: expiresAt });
        const c = computeLateReturnPenalty({ returnDueAt: clamped, now: at(0, 10) });
        expect(c.daysLate).toBe(3);
        expect(c.penaltyAmount).toBe(3 * LATE_RETURN_FEE_PER_DAY);
    });
});
