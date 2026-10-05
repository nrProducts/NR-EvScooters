import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Remove-only damage-charge removal (Return Detail redesign, section 5): a
 * mistakenly-added damage charge is waived rather than edited in place —
 * reuses the existing `waived` terminal status, so `deductionsFor`'s
 * read-time deposit math already excludes it without any further change.
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

const { waiveDamage } = await import("../src/modules/damages/damages.service");
import type { AuthContext } from "../src/types";

const STAFF: AuthContext = {
    id: "aaaaaaaa-0000-0000-0000-000000000000",
    role: "staff",
    permissions: new Set(["returns.approve"]),
    status: "active",
    kycStatus: "not_submitted",
    isDeleted: false,
};
const DAMAGE_ID = "dddddddd-0000-0000-0000-000000000000";
const RENTAL_ID = "11111111-1111-4111-8111-111111111111";
const SUBSCRIPTION_ID = "22222222-2222-4222-8222-222222222222";

function damageRow(status: string) {
    return {
        id: DAMAGE_ID,
        assessed_amount: 2200,
        notes: "Front panel damaged",
        damage_category: "panel",
        status,
        created_at: "2026-08-25T10:00:00.000Z",
        incidents: { id: "inc-1", rental_id: RENTAL_ID, description: "Front panel cracked", photo_paths: [], reported_by: null, rentals: { subscription_id: SUBSCRIPTION_ID, subscriptions: { booking_id: "book-1" } } },
        damage_disputes: null,
    };
}

beforeEach(() => {
    queues = {};
});

describe("waiveDamage", () => {
    it("rejects removing a damage charge that is not currently assessed (already waived)", async () => {
        queue("damages", { data: damageRow("waived"), error: null });

        await expect(waiveDamage(DAMAGE_ID, STAFF)).rejects.toThrow(
            "Only an assessed damage charge can be removed.",
        );
    });

    it("rejects removing a disputed damage charge", async () => {
        queue("damages", { data: damageRow("disputed"), error: null });

        await expect(waiveDamage(DAMAGE_ID, STAFF)).rejects.toThrow(
            "Only an assessed damage charge can be removed.",
        );
    });

    it("waives an assessed damage charge and recomputes the deposit", async () => {
        queue("damages", { data: damageRow("assessed"), error: null });
        queue("subscriptions", { data: { id: SUBSCRIPTION_ID, user_id: "rider-1", booking_id: "book-1" }, error: null });
        queue("damages", { data: damageRow("waived"), error: null });
        queue("deposits", { data: null, error: null }); // deductionsFor's deposit lookup
        queue("deposits", { data: null, error: null }); // recomputeDepositStatusForSubscription's own lookup

        const result = await waiveDamage(DAMAGE_ID, STAFF);
        expect(result.status).toBe("waived");
    });
});
