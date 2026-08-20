import { describe, expect, it } from "vitest";
import { computePlanResume } from "../src/modules/subscriptions/subscriptions.service";

// Local-time Date constructors (NOT ISO 'Z' strings) — wholeDaysBetween
// (common/dates.ts) buckets by LOCAL calendar day, the same convention
// computeCancellationCharge/computeLateReturnPenalty already use. A 'Z'
// (UTC) instant near a local midnight boundary would make this test's
// result depend on the runner's timezone.
const local = (year: number, month: number, day: number, hour = 0): Date =>
    new Date(year, month - 1, day, hour);

describe("computePlanResume (subscription pause/resume)", () => {
    it("matches the spec's worked example: assign 10 Aug, pause 13 Aug, resume 16 Aug (7-day plan)", () => {
        // 10 Aug assign -> next_due_at = 17 Aug (frozen input, not itself under test here).
        const result = computePlanResume({
            endsOn: "2026-08-17",
            pausedAt: local(2026, 8, 13, 9),
            resumedAt: local(2026, 8, 16, 9),
        });

        expect(result.daysPaused).toBe(3);
        expect(result.newEndsOn).toBe("2026-08-20");
        // 17 Aug had not yet passed when the pause began (13 Aug) -> active, not due.
        expect(result.restoredStatus).toBe("active");
    });

    it("restores to 'past_due' when the plan was already overdue at the moment it was paused", () => {
        const result = computePlanResume({
            endsOn: "2026-08-10",
            pausedAt: local(2026, 8, 12), // paused 2 days after it was already due
            resumedAt: local(2026, 8, 14),
        });

        expect(result.restoredStatus).toBe("past_due");
        expect(result.daysPaused).toBe(2);
        expect(result.newEndsOn).toBe("2026-08-12");
    });

    it("is zero when resumed the same day it was paused", () => {
        const result = computePlanResume({
            endsOn: "2026-08-17",
            pausedAt: local(2026, 8, 13, 8),
            resumedAt: local(2026, 8, 13, 20),
        });

        expect(result.daysPaused).toBe(0);
        expect(result.newEndsOn).toBe("2026-08-17");
        expect(result.restoredStatus).toBe("active");
    });

    it("never returns a negative day count from a clock-skew resumedAt before pausedAt", () => {
        const result = computePlanResume({
            endsOn: "2026-08-17",
            pausedAt: local(2026, 8, 13),
            resumedAt: local(2026, 8, 12),
        });

        expect(result.daysPaused).toBe(0);
    });

    it("composes across a second, later pause/resume cycle on the same booking", () => {
        // First cycle: 3 days paused, due date 17 -> 20 Aug.
        const first = computePlanResume({
            endsOn: "2026-08-17",
            pausedAt: local(2026, 8, 13),
            resumedAt: local(2026, 8, 16),
        });
        expect(first.newEndsOn).toBe("2026-08-20");

        // Second cycle, later: paused again 25 Aug (against the updated due
        // date from the first cycle), resumed 5 days later.
        const second = computePlanResume({
            endsOn: first.newEndsOn,
            pausedAt: local(2026, 8, 25),
            resumedAt: local(2026, 8, 30),
        });
        expect(second.daysPaused).toBe(5);
        expect(second.newEndsOn).toBe("2026-08-25");
    });
});
