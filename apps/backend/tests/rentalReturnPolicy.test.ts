import { describe, expect, it } from "vitest";
import { computeLateReturnPenalty, returnDeadlineFor } from "../src/modules/rentals/rentals.service";
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
        expect(c.hadRequest).toBe(true);
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

describe("computeLateReturnPenalty — no request to be late against", () => {
    it("charges nothing when staff close a ride the rider never asked to return", () => {
        const c = computeLateReturnPenalty({ returnDueAt: null, now: at(30) });
        expect(c.hadRequest).toBe(false);
        expect(c.daysLate).toBe(0);
        expect(c.isLate).toBe(false);
        expect(c.penaltyAmount).toBe(0);
    });

    it("fails open on an unparseable deadline rather than charging", () => {
        const c = computeLateReturnPenalty({ returnDueAt: "not-a-date", now: at(30) });
        expect(c.hadRequest).toBe(false);
        expect(c.penaltyAmount).toBe(0);
    });

    it("always reports the fee in force, even at zero charge", () => {
        expect(computeLateReturnPenalty({ returnDueAt: null }).feePerDay).toBe(LATE_RETURN_FEE_PER_DAY);
    });
});
