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

const { rejectReturn, returnApprovalPayload } = await import("../src/modules/rentals/rentals.service");
import type { AuthContext } from "../src/types";

const STAFF: AuthContext = {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    roles: ["staff"],
    capabilities: [],
    accountStatus: "active",
    kycStatus: "not_submitted",
    isDeleted: false,
};
const RENTAL_ID = "11111111-1111-4111-8111-111111111111";
const RIDER_ID = "22222222-2222-4222-8222-222222222222";

const baseRentalRow = {
    id: RENTAL_ID,
    status: "active",
    started_at: "2026-08-01T00:00:00.000Z",
    ended_at: null,
    start_battery_pct: null,
    end_battery_pct: null,
    fare: null,
    vehicle_id: "33333333-3333-4333-8333-333333333333",
    booking_id: null,
    return_requested_at: null,
    return_reason: null,
    return_feedback: null,
    return_due_at: null,
    return_approved_at: null,
    days_late: null,
    late_penalty_amount: null,
    late_fee_per_day: null,
    plan_id: null,
    plan_duration_days: null,
    plan_price_at_pickup: null,
    expires_at: null,
    users: { id: RIDER_ID, full_name: "Rider", phone: null },
    vehicles: { id: "33333333-3333-4333-8333-333333333333", name: "Scooter", registration_number: "TN01AB1234", battery_percentage: 80 },
    return_approved_by: null,
};

beforeEach(() => {
    queryStub = new QueryStub();
    writeAudit.mockClear();
    notifyUser.mockClear();
});

describe("rejectReturn", () => {
    it("refuses when no return request is pending", async () => {
        queryStub.result = { data: { ...baseRentalRow, return_requested_at: null }, error: null };

        await expect(rejectReturn(RENTAL_ID, { reason: "Not applicable" }, STAFF)).rejects.toThrow(
            "No return request is pending for this rental.",
        );

        expect(queryStub.calls.some(([name]) => name === "update")).toBe(false);
        expect(writeAudit).not.toHaveBeenCalled();
        expect(notifyUser).not.toHaveBeenCalled();
    });

    it("clears the return request, keeps the rental active, and notifies the rider with the reason", async () => {
        queryStub.result = {
            data: {
                ...baseRentalRow,
                return_requested_at: "2026-08-10T10:00:00.000Z",
                return_reason: "no_longer_needed",
                return_due_at: "2026-08-10T18:29:59.999Z",
            },
            error: null,
        };

        const result = await rejectReturn(RENTAL_ID, { reason: "Battery swap still in progress" }, STAFF);
        expect(result.id).toBe(RENTAL_ID);

        const updateCall = queryStub.calls.find(([name]) => name === "update");
        expect(updateCall?.[1][0]).toEqual({
            return_requested_at: null,
            return_reason: null,
            return_feedback: null,
            return_due_at: null,
        });

        expect(writeAudit).toHaveBeenCalledOnce();
        expect(writeAudit.mock.calls[0][0]).toMatchObject({
            action: "rental.return_rejected",
            entityId: RENTAL_ID,
            targetUserId: RIDER_ID,
            after: { return_requested_at: null, reason: "Battery swap still in progress" },
        });

        expect(notifyUser).toHaveBeenCalledOnce();
        expect(notifyUser.mock.calls[0][0]).toBe(RIDER_ID);
        expect(notifyUser.mock.calls[0][1]).toMatchObject({ template: "rental_return_rejected" });
        expect(notifyUser.mock.calls[0][1].body).toContain("Battery swap still in progress");
    });
});

describe("returnApprovalPayload", () => {
    const now = new Date("2026-08-12T09:00:00.000Z");

    it("stamps approval when a return was pending — this IS the approval, not a separate step", () => {
        expect(returnApprovalPayload({ return_requested_at: "2026-08-11T00:00:00.000Z" }, STAFF, now)).toEqual({
            return_approved_at: now.toISOString(),
            return_approved_by: STAFF.id,
        });
    });

    it("stamps nothing for a direct staff close with no return ever requested", () => {
        expect(returnApprovalPayload({ return_requested_at: null }, STAFF, now)).toEqual({});
    });
});
