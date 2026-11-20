import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * anchorCycleAtPickup — src/modules/subscriptions/cycleAnchor.ts.
 *
 * Covers the optional staff-chosen billing time at pickup: the billing clock
 * (cycle_time, period #1's end, due_back_at) follows the chosen time, while
 * the rental's start stays the real handover instant.
 */
type Result = { data: unknown; error: unknown; count?: number };

class TableStub {
    calls: [string, unknown[]][] = [];
    constructor(private result: Result) {}
    private record(name: string, args: unknown[]) {
        this.calls.push([name, args]);
        return this;
    }
    select = (...a: unknown[]) => this.record("select", a);
    update = (...a: unknown[]) => this.record("update", a);
    eq = (...a: unknown[]) => this.record("eq", a);
    single = (...a: unknown[]) => this.record("single", a);
    maybeSingle = (...a: unknown[]) => this.record("maybeSingle", a);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;
let stubs: Record<string, TableStub[]>;

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => {
            const stub = new TableStub(queues[table]?.shift() ?? { data: null, error: null });
            (stubs[table] ??= []).push(stub);
            return stub;
        },
    },
}));

const { anchorCycleAtPickup } = await import("../src/modules/subscriptions/cycleAnchor");

const SUB = "11111111-1111-4111-8111-111111111111";
// 20 Nov 2026, 9:53 PM IST
const NOW = new Date("2026-11-20T16:23:00Z");

function firstPickup(periodStart = "2026-11-18", periodEnd = "2026-11-25") {
    queues = {
        subscriptions: [{ data: { cycle_time: "12:00:00" }, error: null }, { data: null, error: null }],
        subscription_periods: [
            { data: { id: "p1", sequence_number: 1, starts_on: periodStart, ends_on: periodEnd }, error: null },
            { data: null, error: null },
        ],
        rentals: [{ data: null, error: null, count: 0 }],
    };
}

function updateOf(table: string, index: number) {
    return stubs[table][index].calls.find(([n]) => n === "update")?.[1][0];
}

beforeEach(() => {
    stubs = {};
});

describe("first pickup, no billing time chosen (unchanged behaviour)", () => {
    it("bills at the pickup minute and starts the rental at that boundary", async () => {
        firstPickup();
        const a = await anchorCycleAtPickup(SUB, NOW);
        expect(a.cycleTime).toBe("21:53:00");
        expect(a.startAt).toBe("2026-11-20T21:53:00+05:30");
        expect(a.endAt).toBe("2026-11-27T21:53:00+05:30");
        expect(updateOf("subscriptions", 1)).toEqual({ cycle_time: "21:53:00" });
        expect(updateOf("subscription_periods", 1)).toEqual({ starts_on: "2026-11-20", ends_on: "2026-11-27", due_on: "2026-11-27" });
    });
});

describe("first pickup with a chosen billing time", () => {
    it("an EARLIER time: billing clock moves, rental still starts at the real handover", async () => {
        firstPickup();
        const a = await anchorCycleAtPickup(SUB, NOW, "20:00:00");
        expect(a.cycleTime).toBe("20:00:00");
        expect(a.startAt).toBe(NOW.toISOString());
        expect(a.endAt).toBe("2026-11-27T20:00:00+05:30");
        expect(a.endDate).toBe("2026-11-27");
        expect(updateOf("subscriptions", 1)).toEqual({ cycle_time: "20:00:00" });
        // Period #1 still begins on the pickup day and keeps its 7-day length.
        expect(updateOf("subscription_periods", 1)).toEqual({ starts_on: "2026-11-20", ends_on: "2026-11-27", due_on: "2026-11-27" });
    });

    it("a LATER time works the same way", async () => {
        firstPickup();
        const a = await anchorCycleAtPickup(SUB, NOW, "23:30:00");
        expect(a.cycleTime).toBe("23:30:00");
        expect(a.startAt).toBe(NOW.toISOString());
        expect(a.endAt).toBe("2026-11-27T23:30:00+05:30");
    });
});

describe("not a first pickup (swap / re-issue)", () => {
    function runningClock() {
        queues = {
            subscriptions: [{ data: { cycle_time: "21:53:00" }, error: null }],
            subscription_periods: [{ data: { id: "p2", sequence_number: 2, starts_on: "2026-11-27", ends_on: "2026-12-04" }, error: null }],
            rentals: [{ data: null, error: null, count: 1 }],
        };
    }

    it("keeps the running clock when no time is chosen", async () => {
        runningClock();
        const a = await anchorCycleAtPickup(SUB, NOW);
        expect(a.cycleTime).toBe("21:53:00");
        expect(a.endAt).toBe("2026-12-04T21:53:00+05:30");
        expect(stubs.subscriptions).toHaveLength(1); // no update
    });

    it("refuses a chosen billing time instead of silently ignoring it", async () => {
        runningClock();
        await expect(anchorCycleAtPickup(SUB, NOW, "20:00:00")).rejects.toMatchObject({ status: 422 });
        expect(stubs.subscriptions).toHaveLength(1);
    });
});
