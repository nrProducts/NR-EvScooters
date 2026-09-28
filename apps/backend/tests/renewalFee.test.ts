import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal Supabase stub — only what lateFeeRateFor touches (a single
 * `pricing_rules` select, override-then-global). Same per-table FIFO-queue
 * shape as overdueLateFee.test.ts, kept intentionally separate rather than
 * imported from it: sharing a live queue across two test files' module
 * instances is more fragile than the few lines this duplicates.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    eq = () => this;
    maybeSingle = () => this;
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;

function queue(table: string, result: Result) {
    (queues[table] ??= []).push(result);
}

/** No per-subscription override, then the global rule at the given rate. */
function queueGlobalRate(amount: number) {
    queue("pricing_rules", { data: null, error: null });
    queue("pricing_rules", { data: { amount, is_active: true }, error: null });
}

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => new TableStub(queues[table]?.shift() ?? { data: null, error: null }),
    },
}));

const { computeLateRenewalFee } = await import("../src/modules/payments/renewalFee");
const { previewOverdueLateFee } = await import("../src/modules/rentals/overdueLateFee");

const SUBSCRIPTION_ID = "44444444-4444-4444-4444-444444444444";
const PERIOD_ID = "55555555-5555-5555-5555-555555555555";

beforeEach(() => {
    queues = {};
});

afterEach(() => {
    vi.useRealTimers();
});

describe("computeLateRenewalFee — dueDate string is anchored to noon IST", () => {
    it("is not late at all before the due instant — no DB call needed", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T11:59:00+05:30"));

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");
        expect(result).toEqual({ isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0, hoursLate: 0 });
    });

    it("is not late exactly at noon on the due date", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T12:00:00+05:30"));

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");
        expect(result.isLate).toBe(false);
        expect(result.daysLate).toBe(0);
    });

    it("owes exactly one day's fee one minute after noon — no 24-hour grace", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T12:01:00+05:30"));
        queueGlobalRate(450);

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");
        expect(result).toMatchObject({ isLate: true, daysLate: 1, lateFee: 450, feePerDay: 450 });
    });

    it("owes two days' fee one minute past the 24-hour mark", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-03T12:01:00+05:30"));
        queueGlobalRate(450);

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");
        expect(result).toMatchObject({ isLate: true, daysLate: 2, lateFee: 900 });
    });

    it("prefers a subscription-specific override rate over the global rule", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-02T18:00:00+05:30"));
        queue("pricing_rules", { data: { amount: 999, is_active: true }, error: null }); // override hit

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");
        expect(result).toMatchObject({ isLate: true, daysLate: 1, lateFee: 999, feePerDay: 999 });
    });

    it("treats an invalid due-date string as not late rather than throwing", async () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-05T00:00:00+05:30"));

        const result = await computeLateRenewalFee(SUBSCRIPTION_ID, "not-a-date");
        expect(result).toEqual({ isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0, hoursLate: 0 });
    });

    it("accepts an explicit `now` for deterministic testing without faking the global clock", async () => {
        queueGlobalRate(450);
        const result = await computeLateRenewalFee(
            SUBSCRIPTION_ID, "2026-10-02", new Date("2026-10-04T12:01:00+05:30"),
        );
        expect(result).toMatchObject({ isLate: true, daysLate: 3, lateFee: 1350 });
    });
});

/**
 * The requirement this section exists to prove: renewal and return are not
 * two formulas that happen to agree — they are the SAME function call.
 * `previewOverdueLateFee` (the return-side preview, overdueLateFee.ts)
 * resolves its own reference date and then calls computeLateRenewalFee
 * directly; nothing return-specific ever re-derives daysLate on its own.
 */
describe("renewal and return produce identical results from the same due date and instant", () => {
    it.each([
        ["12:01 PM the same day", "2026-10-02T12:01:00+05:30", 1, 450],
        ["6:00 PM the same day", "2026-10-02T18:00:00+05:30", 1, 450],
        ["12:00 PM the next day (exactly 24h)", "2026-10-03T12:00:00+05:30", 1, 450],
        ["12:01 PM the next day (24h + 1m)", "2026-10-03T12:01:00+05:30", 2, 900],
        ["12:01 PM two days later", "2026-10-04T12:01:00+05:30", 3, 1350],
    ] as const)("%s => renewal and return both report %d day(s), ₹%d", async (_label, nowIso, days, fee) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(nowIso));

        queueGlobalRate(450);
        const renewal = await computeLateRenewalFee(SUBSCRIPTION_ID, "2026-10-02");

        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-10-02" }, error: null });
        queueGlobalRate(450);
        const returnPreview = await previewOverdueLateFee(SUBSCRIPTION_ID);

        expect(renewal.daysLate).toBe(days);
        expect(renewal.lateFee).toBe(fee);
        expect(returnPreview.daysLate).toBe(renewal.daysLate);
        expect(returnPreview.lateFee).toBe(renewal.lateFee);
        expect(returnPreview.isLate).toBe(renewal.isLate);
    });
});
