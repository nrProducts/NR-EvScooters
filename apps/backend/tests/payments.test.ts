import { describe, expect, it } from "vitest";
import { addDays } from "../src/common/dates";

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
