import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, FakeSupabase } from "./helpers/fakeSupabase";

/**
 * UAT, 2026-10-18: six refunds with real Razorpay ids (rfnd_…) sat at
 * "Processing" for days although the money had gone back — Razorpay answers
 * "pending" for nearly every refund, and the refund.processed webhook was the
 * only thing that ever completed one (UAT had received zero webhooks).
 * syncProcessingRefunds asks Razorpay directly instead.
 */
const h = vi.hoisted(() => ({
    fake: null as unknown as FakeSupabase,
    notifyUser: vi.fn(async () => undefined),
    /** Whether the succeeded-update finds the row still open (false = the webhook beat us). */
    stillOpen: true,
}));

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: { from: (table: string) => h.fake.from(table), rpc: (...a: unknown[]) => h.fake.rpc(...a) },
}));
vi.mock("../src/modules/notifications/notifications.service", () => ({ notifyUser: h.notifyUser }));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => undefined) }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => undefined) }));

import { syncProcessingRefunds } from "../src/modules/refunds/refunds.service";

const OPEN = [
    { id: "r1", gateway_refund_id: "rfnd_processed" },
    { id: "r2", gateway_refund_id: "rfnd_pending" },
    { id: "r3", gateway_refund_id: "rfnd_failed" },
];

function refundRow(gatewayRefundId: string) {
    const open = OPEN.find((r) => r.gateway_refund_id === gatewayRefundId)!;
    return {
        id: open.id, user_id: "rider-1", amount: 8, status: "processing", reason: "booking_cancellation",
        gateway_refund_id: gatewayRefundId, attempt_count: 1, payment_transactions: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    h.stillOpen = true;
    h.fake = createFakeSupabase((q) => {
        if (q.table !== "refunds") return { data: null };
        if (q.op === "select" && q.single) {
            const id = q.filters.find(([, col]) => col === "gateway_refund_id")?.[2] as string;
            return { data: refundRow(id) };
        }
        if (q.op === "select") return { data: OPEN };
        if (q.op === "update" && q.payload?.status === "succeeded") {
            return { data: h.stillOpen ? [{ id: "r1" }] : [] };
        }
        return { data: null };
    });
});

const gateway = vi.fn(async (id: string) => ({
    status: id === "rfnd_processed" ? "processed" : id === "rfnd_failed" ? "failed" : "pending",
    error_description: id === "rfnd_failed" ? "Bank rejected the refund" : null,
}));

describe("syncProcessingRefunds", () => {
    it("completes a refund Razorpay has processed, fails a failed one, and leaves a pending one alone", async () => {
        const result = await syncProcessingRefunds(gateway);

        expect(result).toEqual({ checked: 3, completed: 1, failed: 1 });
        const updates = h.fake.on("refunds", "update");
        expect(updates.find((u) => u.payload?.status === "succeeded")?.filters).toContainEqual(["eq", "id", "r1"]);
        expect(updates.find((u) => u.payload?.status === "failed")?.payload)
            .toMatchObject({ failure_reason: "Bank rejected the refund" });
        expect(updates.some((u) => u.filters.some(([, , v]) => v === "r2"))).toBe(false);
    });

    it("tells the rider their refund is complete", async () => {
        await syncProcessingRefunds(gateway);

        expect(h.notifyUser).toHaveBeenCalledTimes(1);
        expect(h.notifyUser).toHaveBeenCalledWith("rider-1", expect.objectContaining({
            template: "refund_completed", title: "Refund Completed",
        }));
    });

    it("never notifies twice when the webhook completed the refund first", async () => {
        h.stillOpen = false;
        await syncProcessingRefunds(gateway);
        expect(h.notifyUser).not.toHaveBeenCalled();
    });

    it("only asks about real gateway refunds still processing", async () => {
        await syncProcessingRefunds(gateway);

        const [list] = h.fake.on("refunds", "select").filter((q) => !q.single);
        expect(list.filters).toEqual(expect.arrayContaining([
            ["eq", "status", "processing"],
            ["not", "gateway_refund_id", "is"],
            ["not", "gateway_refund_id", "like"],
        ]));
    });

    it("keeps going when the gateway errors on one refund", async () => {
        const flaky = vi.fn(async (id: string) => {
            if (id === "rfnd_pending") throw { error: { description: "Gateway timeout" } };
            return gateway(id);
        });
        const result = await syncProcessingRefunds(flaky);
        expect(result).toEqual({ checked: 2, completed: 1, failed: 1 });
    });
});
