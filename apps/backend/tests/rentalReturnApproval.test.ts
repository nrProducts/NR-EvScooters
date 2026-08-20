import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Same QueryStub shape as tests/batteryStations.test.ts: every filter method
 * records its call and returns `this`; the object is thenable and resolves
 * to whatever `.result` currently holds. rejectReturn only ever needs the
 * shape of the UPDATE it sends (the point of these tests), not a faithful
 * round-trip of "before" vs "after" row data — the select before it and the
 * select after it (getRentalById) can safely share one `.result`.
 */
class QueryStub {
    calls: [string, unknown[]][] = [];
    result: { data: unknown; error: unknown; count?: number } = { data: null, error: null };

    private record(name: string, args: unknown[]) {
        this.calls.push([name, args]);
        return this;
    }

    select = (...args: unknown[]) => this.record("select", args);
    eq = (...args: unknown[]) => this.record("eq", args);
    in = (...args: unknown[]) => this.record("in", args);
    not = (...args: unknown[]) => this.record("not", args);
    update = (...args: unknown[]) => this.record("update", args);
    maybeSingle = (...args: unknown[]) => this.record("maybeSingle", args);
    single = (...args: unknown[]) => this.record("single", args);

    then(onFulfilled: (value: typeof this.result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queryStub: QueryStub;

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: { from: () => queryStub },
}));

const writeAudit = vi.fn(async () => {});
vi.mock("../src/common/audit", () => ({ writeAudit: (...args: unknown[]) => writeAudit(...args) }));

const notifyUser = vi.fn(async () => {});
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: (...args: unknown[]) => notifyUser(...args),
}));

const { rejectReturn } = await import("../src/modules/rentals/rentals.service");
import type { AuthContext } from "../src/types";

const STAFF: AuthContext = {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    role: "staff",
    permissions: new Set(["returns.approve"]),
    status: "active",
    kycStatus: "not_submitted",
    isDeleted: false,
};
const RENTAL_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";

/**
 * The return workflow is a ROW now, not eight columns on the rental.
 *
 * `rental_returns` has its own status — requested → inspected → approved /
 * rejected — which is what makes rejecting and re-requesting expressible. The
 * old shape simulated a rejection by nulling four columns back out, leaving
 * no trace that a return had ever been asked for and refused.
 */
const baseRentalRow = {
    id: RENTAL_ID,
    status: "active",
    picked_up_at: "2026-08-01T00:00:00.000Z",
    returned_at: null,
    due_back_at: null,
    end_reason: null,
    subscription_id: null,
    users: { id: RIDER_ID, full_name: "Rider", phone: null },
    // No `rental_returns` row: nothing has been requested.
    rental_returns: [],
};

/** A pending return, in the shape the embed returns it. */
const pendingReturn = {
    id: "44444444-4444-4444-8444-444444444444",
    status: "requested",
    requested_at: "2026-08-10T10:00:00.000Z",
    requested_reason: "no_longer_needed",
    rider_notes: null,
    due_back_at: "2026-08-10T18:29:59.999Z",
};

beforeEach(() => {
    queryStub = new QueryStub();
    writeAudit.mockClear();
    notifyUser.mockClear();
});

describe("rejectReturn", () => {
    it("refuses when no return request is pending", async () => {
        queryStub.result = { data: { ...baseRentalRow, rental_returns: [] }, error: null };

        await expect(rejectReturn(RENTAL_ID, { reason: "Not applicable" }, STAFF)).rejects.toThrow(
            "No return request is pending for this rental.",
        );

        expect(queryStub.calls.some(([name]) => name === "update")).toBe(false);
        expect(writeAudit).not.toHaveBeenCalled();
        expect(notifyUser).not.toHaveBeenCalled();
    });

    // The rejection is RECORDED rather than erased, which is the substantive
    // change: the row stays, marked `rejected` with a reason and an author, and
    // a fresh request creates a new row beside it.
    it("records the rejection, keeps the rental active, and notifies the rider with the reason", async () => {
        queryStub.result = {
            data: { ...baseRentalRow, rental_returns: [pendingReturn] },
            error: null,
        };

        const result = await rejectReturn(RENTAL_ID, { reason: "Battery swap still in progress" }, STAFF);
        expect(result.id).toBe(RENTAL_ID);

        const updateCall = queryStub.calls.find(([name]) => name === "update");
        expect(updateCall?.[1][0]).toMatchObject({
            status: "rejected",
            rejected_by_user_id: STAFF.id,
            rejection_reason: "Battery swap still in progress",
        });
        expect((updateCall?.[1][0] as { rejected_at: string }).rejected_at).toBeTruthy();

        // Guarded on the states a rejection can act on, so a return that was
        // approved between the read and the write is not un-approved.
        const inCall = queryStub.calls.find(([name]) => name === "in");
        expect(inCall?.[1]).toEqual(["status", ["requested", "inspected"]]);

        expect(writeAudit).toHaveBeenCalledOnce();
        expect(writeAudit.mock.calls[0][0]).toMatchObject({
            action: "rental.return_rejected",
            entityType: "rental_return",
            entityId: RENTAL_ID,
            targetUserId: RIDER_ID,
            after: { status: "rejected", reason: "Battery swap still in progress" },
        });

        expect(notifyUser).toHaveBeenCalledOnce();
        expect(notifyUser.mock.calls[0][0]).toBe(RIDER_ID);
        expect(notifyUser.mock.calls[0][1]).toMatchObject({ template: "rental_return_rejected" });
        expect(notifyUser.mock.calls[0][1].body).toContain("Battery swap still in progress");
    });
});

/*
 * `returnApprovalPayload` is gone.
 *
 * It existed to decide which of two columns to stamp onto the RENTAL when a
 * ride was closed: `return_approved_at`/`return_approved_by` if a return had
 * been requested, nothing if a staff member was simply closing a ride. Both
 * columns are fields on the `rental_returns` row now, and approving a return
 * is an update to that row rather than a side effect of closing the rental —
 * so there is no longer a payload to compute, and no way for the two to
 * disagree about whether an approval happened.
 */
