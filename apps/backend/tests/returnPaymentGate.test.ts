import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Critical Validation (Vehicle Return → Payment Gate spec): the API must
 * reject Approve Return whenever AdditionalAmountDue > 0 AND PaymentStatus
 * != Verified — enforced in rentals.service.ts's settleReturn, which both
 * completeRide and moveRideToMaintenance funnel through. This is the one
 * thing that must never regress silently, so it gets its own focused test
 * independent of the full admin approval orchestration.
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
    update = (...a: unknown[]) => this.record("update", a);
    eq = (...a: unknown[]) => this.record("eq", a);
    neq = (...a: unknown[]) => this.record("neq", a);
    in = (...a: unknown[]) => this.record("in", a);
    is = (...a: unknown[]) => this.record("is", a);
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

const { completeRide } = await import("../src/modules/rentals/rentals.service");
import type { AuthContext } from "../src/types";

const STAFF: AuthContext = {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    role: "staff",
    permissions: new Set(["vehicles.edit"]),
    status: "active",
    kycStatus: "not_submitted",
    isDeleted: false,
};
const RENTAL_ID = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION_ID = "22222222-2222-4222-8222-222222222222";
const INVOICE_ID = "33333333-3333-4333-8333-333333333333";

function activeRentalRow(ret: Record<string, unknown> | null) {
    return {
        id: RENTAL_ID,
        status: "active",
        subscription_id: SUBSCRIPTION_ID,
        due_back_at: "2026-08-24T18:29:59.999Z",
        rental_returns: ret ? [ret] : [],
        rental_vehicle_assignments: [],
        subscriptions: null,
        users: { id: "rider" },
    };
}

beforeEach(() => {
    queues = {};
});

describe("settleReturn — additional-amount-due payment gate", () => {
    it("rejects completion when the invoice is staged but not yet verified", async () => {
        queue("rentals", {
            data: activeRentalRow({
                status: "inspected",
                inspected_at: "2026-08-25T00:00:00.000Z",
                additional_due_invoice_id: INVOICE_ID,
                payment_verified_at: null,
            }),
            error: null,
        });

        await expect(completeRide(RENTAL_ID, {}, STAFF)).rejects.toThrow(
            "The rider's outstanding additional amount must be paid and verified before this return can be approved.",
        );
    });

    // completeRide's full happy path (settle → close → release → getRentalById's
    // own re-fetch chain, including return_recovery_settings/pricing_rules for
    // the overdue-late-fee status) is exercised by the pre-existing rentals
    // suite; mocking all of it again here would test the mock, not the gate.
    // What matters for THIS test is specifically that the gate did not fire —
    // proven by the failure being downstream (getRentalById's own re-fetch
    // finding nothing more queued for it), not the gate's own businessRule.
    it("proceeds past the gate once payment_verified_at is set", async () => {
        queue("rentals", {
            data: activeRentalRow({
                status: "inspected",
                inspected_at: "2026-08-25T00:00:00.000Z",
                late_fee_amount: 0,
                other_charges_amount: 0,
                additional_due_invoice_id: INVOICE_ID,
                payment_verified_at: "2026-08-25T01:00:00.000Z",
            }),
            error: null,
        });
        queue("damages", { data: [], error: null });
        queue("deposits", { data: null, error: null });
        queue("rental_settlements", { data: null, error: null });
        queue("rentals", { data: null, error: null });
        queue("rental_vehicle_assignments", { data: null, error: null });

        await expect(completeRide(RENTAL_ID, {}, STAFF)).rejects.not.toThrow(
            "The rider's outstanding additional amount must be paid and verified before this return can be approved.",
        );
    });

    it("does not gate a rental with no return request at all (plain Complete Ride)", async () => {
        queue("rentals", { data: activeRentalRow(null), error: null });
        queue("damages", { data: [], error: null });
        queue("deposits", { data: null, error: null });
        queue("rental_settlements", { data: null, error: null });
        queue("rentals", { data: null, error: null });
        queue("rental_vehicle_assignments", { data: null, error: null });

        await expect(completeRide(RENTAL_ID, {}, STAFF)).rejects.not.toThrow(
            "The rider's outstanding additional amount must be paid and verified before this return can be approved.",
        );
    });
});
