import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Overdue Rider → Late Fee Payment → Scooter Return: the backend-enforced
 * gate in requestReturn (rentals.service.ts). Covers spec Test 2 ("Kavi
 * Overdue" → Return Scooter rejected) and Test 6 ("API Bypass" — calling the
 * return endpoint directly with an unpaid late fee must still be rejected,
 * not just hidden behind a disabled UI button).
 *
 * Same per-table FIFO queue as tests/overdueLateFee.test.ts — requestReturn
 * touches `subscription_periods` three times in sequence before it would
 * ever reach the late-fee gate (periodsFor's list query, then
 * previewOverdueLateFee's and currentPeriodWindow's single-row lookups
 * inside isOverdueLateFeeSettled), so each needs its own queued result.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    calls: [string, unknown[]][] = [];
    constructor(private result: Result) {}
    private record(name: string, args: unknown[]) {
        this.calls.push([name, args]);
        return this;
    }
    select = (...a: unknown[]) => this.record("select", a);
    insert = (...a: unknown[]) => this.record("insert", a);
    eq = (...a: unknown[]) => this.record("eq", a);
    neq = (...a: unknown[]) => this.record("neq", a);
    in = (...a: unknown[]) => this.record("in", a);
    gte = (...a: unknown[]) => this.record("gte", a);
    order = (...a: unknown[]) => this.record("order", a);
    limit = (...a: unknown[]) => this.record("limit", a);
    maybeSingle = (...a: unknown[]) => this.record("maybeSingle", a);
    single = (...a: unknown[]) => this.record("single", a);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;

function queue(table: string, result: Result) {
    (queues[table] ??= []).push(result);
}

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => new TableStub(queues[table]?.shift() ?? { data: null, error: null }),
    },
}));

const { requestReturn } = await import("../src/modules/rentals/rentals.service");
import type { AuthContext } from "../src/types";

const RIDER: AuthContext = {
    id: "22222222-2222-4222-8222-222222222222",
    role: "rider",
    permissions: new Set(),
    status: "active",
    kycStatus: "verified",
    isDeleted: false,
};
const RENTAL_ID = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION_ID = "33333333-3333-4333-8333-333333333333";
const BOOKING_ID = "44444444-4444-4444-8444-444444444444";

const overdueRentalRow = {
    id: RENTAL_ID,
    user_id: RIDER.id,
    status: "active",
    due_back_at: "2026-08-24T18:29:59.999Z",
    subscription_id: SUBSCRIPTION_ID,
    rental_returns: [],
    rental_vehicle_assignments: [],
    subscriptions: { id: SUBSCRIPTION_ID, booking_id: BOOKING_ID },
};

beforeEach(() => {
    queues = {};
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T10:00:00+05:30"));
});

afterEach(() => {
    vi.useRealTimers();
});

describe("requestReturn — overdue late-fee gate", () => {
    it("rejects the return with the spec's exact message when the renewal late fee is unpaid", async () => {
        queue("rentals", { data: overdueRentalRow, error: null });
        // periodsFor: the current period rolled past its due_on two days ago,
        // and the rider's committed period IS over, so the earlier
        // period-due gate passes through to the late-fee gate.
        queue("subscription_periods", {
            data: [{
                subscription_id: SUBSCRIPTION_ID, status: "current",
                starts_on: "2026-08-17", due_on: "2026-08-24",
            }],
            error: null,
        });
        // previewOverdueLateFee's own due_on lookup.
        queue("subscription_periods", { data: { due_on: "2026-08-24" }, error: null });
        queue("pricing_rules", { data: null, error: null }); // no per-subscription override
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null }); // global rule
        // currentPeriodWindow's id/created_at lookup.
        queue("subscription_periods", {
            data: { id: "period-1", created_at: "2026-08-17T00:00:00.000Z" },
            error: null,
        });
        queue("invoices", { data: null, error: null }); // no adhoc invoice created yet

        await expect(requestReturn(RENTAL_ID, { reason: "plan_ended", rating: 4 }, RIDER)).rejects.toThrow(
            "Late fee payment required before vehicle return.",
        );
    });

    it("does not even reach the late-fee gate when the rider isn't overdue", async () => {
        queue("rentals", {
            data: { ...overdueRentalRow, due_back_at: "2026-08-30T18:29:59.999Z" },
            error: null,
        });
        queue("subscription_periods", {
            data: [{
                subscription_id: SUBSCRIPTION_ID, status: "current",
                starts_on: "2026-08-24", due_on: "2026-08-31",
            }],
            error: null,
        });

        // The period-due gate ("your plan period hasn't ended yet") fires
        // first and blocks it BEFORE isOverdueLateFeeSettled is ever called —
        // proven by there being no queued subscription_periods/pricing_rules
        // results left for it to consume.
        await expect(requestReturn(RENTAL_ID, { reason: "plan_ended", rating: 4 }, RIDER)).rejects.toThrow(
            "You can return your scooter once your current plan period ends on 2026-08-31.",
        );
    });
});
