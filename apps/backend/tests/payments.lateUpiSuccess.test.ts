import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler } from "./helpers/fakeSupabase";

/**
 * Late UPI success: a pay_id recorded as a DECLINED attempt is later
 * captured. The success insert hits the unique gateway_payment_id; before
 * this fix that returned as "already applied" and the captured money was
 * dropped — no allocation, no booking. It must now upgrade the failed row in
 * place and carry on exactly as for a fresh capture.
 */

process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test-key-secret";

let handler: QueryHandler = () => ({ data: null });
const fakeRef = { current: createFakeSupabase((q) => handler(q)) as unknown as Record<string, unknown> };

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

const writeAudit = vi.fn(async (_entry: unknown) => {});
vi.mock("../src/common/audit", () => ({ writeAudit: (e: unknown) => writeAudit(e) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({ notifyUser: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({ applyRefundWebhookResult: vi.fn(async () => {}) }));

const { applyPaymentSuccess } = await import("../src/modules/payments/payments.service");

const INPUT = {
    paymentOrderId: "order-uuid-1",
    gatewayPaymentId: "pay_lateupi01",
    gatewaySignature: null,
    amount: 3600,
    method: "upi",
    rawPayload: { id: "pay_lateupi01", status: "captured" },
};

interface State {
    existingStatus: "failed" | "succeeded";
    existingOrderId?: string;
    /** What the guarded UPDATE returns — null simulates a concurrent upgrade. */
    upgradeReturns: { id: string } | null;
}

function lateSuccessHandler(state: State): QueryHandler {
    return (q) => {
        if (q.table === "payment_orders" && q.op === "select") {
            return {
                data: {
                    id: "order-uuid-1",
                    user_id: "rider-1",
                    invoice_id: "invoice-1",
                    purpose: "invoice",
                    invoices: {
                        purpose: "adhoc",
                        subscription_id: "sub-1",
                        subscription_period_id: null,
                        total_amount: 3600,
                    },
                },
            };
        }
        if (q.table === "payment_transactions" && q.op === "insert") {
            return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        }
        if (q.table === "payment_transactions" && q.op === "select") {
            return {
                data: {
                    id: "txn-failed-1",
                    status: state.existingStatus,
                    payment_order_id: state.existingOrderId ?? "order-uuid-1",
                    failure_code: "BAD_REQUEST_ERROR",
                    failure_reason: "Payment was not completed",
                    created_at: "2026-10-22T10:00:00Z",
                },
            };
        }
        if (q.table === "payment_transactions" && q.op === "update") {
            return { data: state.upgradeReturns };
        }
        if (q.table === "v_invoice_balances") return { data: { balance_amount: 3600, is_paid: false } };
        if (q.table === "payment_allocations") return { data: { id: "alloc-1" } };
        return { data: null };
    };
}

function fake() {
    return fakeRef.current as unknown as ReturnType<typeof createFakeSupabase>;
}

beforeEach(() => {
    writeAudit.mockClear();
});

function install(state: State) {
    handler = lateSuccessHandler(state);
    fakeRef.current = createFakeSupabase((q) => handler(q)) as unknown as Record<string, unknown>;
}

describe("applyPaymentSuccess — late UPI success", () => {
    it("upgrades the failed row and allocates the captured money to the bill", async () => {
        install({ existingStatus: "failed", upgradeReturns: { id: "txn-failed-1" } });

        await applyPaymentSuccess(INPUT);

        const update = fake().on("payment_transactions", "update")[0];
        expect(update).toBeDefined();
        expect(written(update, "status")).toBe("succeeded");
        expect(written(update, "failure_code")).toBeNull();
        expect(written(update, "failure_reason")).toBeNull();
        expect(written(update, "amount")).toBe(3600);
        expect(written(update, "captured_at")).toEqual(expect.any(String));
        // Guarded so a concurrent second upgrade is a zero-row no-op.
        expect(update.filters).toContainEqual(["eq", "status", "failed"]);

        const allocation = fake().on("payment_allocations", "insert")[0];
        expect(written(allocation, "payment_transaction_id")).toBe("txn-failed-1");
        expect(written(allocation, "amount")).toBe(3600);

        expect(writeAudit).toHaveBeenCalledWith(
            expect.objectContaining({ action: "payment.failed_txn_upgraded", entityId: "txn-failed-1" }),
        );
    });

    it("treats an already-succeeded pay_id as a redelivery and does nothing", async () => {
        install({ existingStatus: "succeeded", upgradeReturns: null });

        await applyPaymentSuccess(INPUT);

        expect(fake().on("payment_transactions", "update")).toHaveLength(0);
        expect(fake().on("payment_allocations", "insert")).toHaveLength(0);
    });

    it("does nothing when another request upgraded the row first", async () => {
        install({ existingStatus: "failed", upgradeReturns: null });

        await applyPaymentSuccess(INPUT);

        expect(fake().on("payment_allocations", "insert")).toHaveLength(0);
        expect(writeAudit).not.toHaveBeenCalledWith(
            expect.objectContaining({ action: "payment.failed_txn_upgraded" }),
        );
    });

    it("never upgrades a failed row that belongs to a different order", async () => {
        install({ existingStatus: "failed", existingOrderId: "some-other-order", upgradeReturns: { id: "txn-failed-1" } });

        await applyPaymentSuccess(INPUT);

        expect(fake().on("payment_transactions", "update")).toHaveLength(0);
        expect(fake().on("payment_allocations", "insert")).toHaveLength(0);
    });
});
