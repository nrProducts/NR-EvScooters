import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Return Detail redesign: damage is now recorded incrementally via its own
 * endpoint (POST /returns/:id/damage), not submitted with saveInspection.
 * saveInspection's own job shrinks to "stage other charges, and require an
 * explicit confirmNoDamage when nothing was ever recorded" — this guards
 * that new gate specifically, since nothing exercised it before.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    constructor(private result: Result) {}
    select = () => this;
    insert = () => this;
    update = () => this;
    eq = () => this;
    neq = () => this;
    in = () => this;
    is = () => this;
    order = () => this;
    limit = () => this;
    maybeSingle = () => Promise.resolve(this.result);
    single = () => Promise.resolve(this.result);
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
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));

const { saveInspection } = await import("../src/modules/returns/returns.service");
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
const SUBSCRIPTION_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
    queues = {};
});

describe("saveInspection — confirmNoDamage gate", () => {
    it("rejects saving inspection when no damage was ever recorded and confirmNoDamage is not set", async () => {
        queue("rentals", {
            data: {
                id: RENTAL_ID, user_id: "rider-1", status: "active", subscription_id: SUBSCRIPTION_ID,
                rental_returns: [{ status: "requested", inspected_at: null }],
            },
            error: null,
        });

        await expect(saveInspection(RENTAL_ID, { otherCharges: [] }, STAFF)).rejects.toThrow(
            "Record the vehicle inspection — add a damage charge, or confirm none — before saving.",
        );
    });

    it("rejects with the same gate even when otherCharges are supplied but no damage/confirmation exists", async () => {
        queue("rentals", {
            data: {
                id: RENTAL_ID, user_id: "rider-1", status: "active", subscription_id: SUBSCRIPTION_ID,
                rental_returns: [{ status: "requested", inspected_at: null }],
            },
            error: null,
        });

        await expect(
            saveInspection(RENTAL_ID, { otherCharges: [{ label: "Cleaning", amount: 100 }] }, STAFF),
        ).rejects.toThrow("Record the vehicle inspection");
    });
});
