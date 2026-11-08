import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler, type QueryRecord } from "./helpers/fakeSupabase";
import type { GatewayPayment } from "../src/config/razorpay";

/**
 * Late UPI success — the SAME Razorpay payment reported failed, then captured.
 *
 * Prod incidents 2026-10-22 (₹3600 booking) and 2026-11-04 (₹450 late fee):
 * `payment.failed` stored a failed payment_transactions row for the pay_id;
 * the capture for that same pay_id then hit the UNIQUE gateway_payment_id and
 * applyPaymentSuccess returned as "already applied". Money captured, bill
 * still unpaid, no error anywhere.
 *
 * These drive the real service through each entry point that can deliver a
 * capture (webhook, client verify, order sync) with Supabase faked.
 */

const WEBHOOK_SECRET = "test-webhook-secret";
const KEY_SECRET = "test-key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;

let handler: QueryHandler = () => ({ data: null });
let rpcHandler: (fn: string, args: unknown) => { data?: unknown; error?: unknown } = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q), (fn, args) => rpcHandler(fn, args));
const fakeRef = { current: fake as unknown as Record<string, unknown> };

let gatewayPayment: GatewayPayment;
let gatewayOrderPayments: GatewayPayment[] = [];

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

vi.mock("../src/config/razorpay", () => ({
    getRazorpay: () => ({ orders: { create: vi.fn() } }),
    fetchGatewayPayment: async () => gatewayPayment,
    fetchGatewayOrderPayments: async () => gatewayOrderPayments,
}));

const writeAudit = vi.fn(async (_entry: unknown) => {});
vi.mock("../src/common/audit", () => ({ writeAudit: (e: unknown) => writeAudit(e) }));
const notifyUser = vi.fn(async (_u: unknown, _m: unknown) => {});
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: (u: unknown, m: unknown) => notifyUser(u, m),
}));
const notify = vi.fn(async (_m: unknown) => {});
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: (m: unknown) => notify(m) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({
    applyRefundWebhookResult: vi.fn(async () => {}),
}));

const { handleWebhook, verifyPayment, syncOrderPayment } = await import("../src/modules/payments/payments.service");

const RIDER = { id: "rider-1", role: "rider" } as never;
const GW_ORDER = "order_late01";
const PAY_ID = "pay_late01";
const FAILED_TXN = "txn-failed-1";

function sign(body: string): string {
    return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

function checkoutSignature(orderId: string, paymentId: string): string {
    return createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
}

function webhook(event: string, entity: Record<string, unknown> = {}) {
    const body = JSON.stringify({
        event,
        payload: {
            payment: {
                entity: {
                    id: PAY_ID, order_id: GW_ORDER, amount: 45000, currency: "INR", method: "upi",
                    ...entity,
                },
            },
        },
    });
    return { body: Buffer.from(body), signature: sign(body) };
}

interface State {
    /** Status of the row already stored for PAY_ID, or null for none. */
    existingStatus: "failed" | "succeeded" | null;
    existingOrderId?: string;
    existingAmount?: number;
    /** What the conditional failed->succeeded UPDATE matches: true = we win, false = lost race. */
    upgradeWins?: boolean;
    orderStatus?: string;
    purpose?: "invoice" | "booking";
    invoicePurpose?: string;
    isPaid?: boolean;
}

/** An invoice-tied ₹450 order (the 2026-11-04 shape) with a failed row already stored for PAY_ID. */
function stateHandler(s: State): QueryHandler {
    return (q: QueryRecord) => {
        if (q.table === "payment_webhook_events" && q.op === "insert") return { data: { id: "evt-row-1" } };
        if (q.table === "payment_webhook_events" && q.op === "select") {
            return { data: { id: "evt-row-1", processed_at: null, processing_attempts: 0 } };
        }
        if (q.table === "payment_webhook_events") return { data: null };

        if (q.table === "payment_orders" && q.op === "select") {
            return {
                data: {
                    id: "order-uuid-1",
                    user_id: "rider-1",
                    amount: 450,
                    currency: "INR",
                    status: s.orderStatus ?? "failed",
                    invoice_id: s.purpose === "booking" ? null : "invoice-1",
                    purpose: s.purpose ?? "invoice",
                    invoices: s.purpose === "booking" ? null : {
                        purpose: s.invoicePurpose ?? "adhoc",
                        subscription_id: "sub-1",
                        subscription_period_id: s.invoicePurpose === "subscription_period" ? "period-1" : null,
                        total_amount: 450,
                    },
                },
            };
        }
        if (q.table === "payment_orders") return { data: null };

        if (q.table === "payment_transactions" && q.op === "insert") {
            const status = written(q, "status");
            // Unique gateway_payment_id: any insert for PAY_ID conflicts once a row exists.
            if (s.existingStatus && written(q, "gateway_payment_id") === PAY_ID) {
                return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            return { data: { id: status === "failed" ? "txn-new-failed" : "txn-new" } };
        }
        if (q.table === "payment_transactions" && q.op === "select") {
            if (!s.existingStatus) return { data: null };
            return {
                data: {
                    id: FAILED_TXN,
                    payment_order_id: s.existingOrderId ?? "order-uuid-1",
                    status: s.existingStatus,
                    amount: s.existingAmount ?? 450,
                    method: "upi",
                    failure_code: s.existingStatus === "failed" ? "BAD_REQUEST_ERROR" : null,
                    failure_reason: s.existingStatus === "failed"
                        ? "You may have cancelled the payment or there was a delay in response from the UPI app."
                        : null,
                    raw_payload: { status: "failed" },
                    created_at: "2026-11-04T12:44:15Z",
                },
            };
        }
        if (q.table === "payment_transactions" && q.op === "update") {
            return { data: s.upgradeWins === false ? null : { id: FAILED_TXN } };
        }

        if (q.table === "v_invoice_balances") {
            return { data: { balance_amount: 450, allocated_amount: 0, is_paid: s.isPaid ?? true } };
        }
        if (q.table === "invoice_items") {
            return { data: { description: "Overdue plan renewal — late fee (1 day @ ₹150/day)" } };
        }
        if (q.table === "payment_allocations") return { data: { id: "alloc-1" } };
        if (q.table === "subscription_periods") return { data: { sequence_number: 1 } };
        if (q.table === "subscriptions") return { data: { id: "sub-1", booking_id: "booking-1" } };
        if (q.table === "bookings") return { data: null };
        return { data: null };
    };
}

function install(s: State) {
    handler = stateHandler(s);
    fake = createFakeSupabase((q) => handler(q), (fn, args) => rpcHandler(fn, args));
    fakeRef.current = fake as unknown as Record<string, unknown>;
}

function upgradeUpdate() {
    return fake.on("payment_transactions", "update")[0];
}

beforeEach(() => {
    rpcHandler = () => ({ data: null });
    writeAudit.mockClear();
    notifyUser.mockClear();
    notify.mockClear();
    install({ existingStatus: "failed" });
    gatewayPayment = {
        id: PAY_ID, order_id: GW_ORDER, amount: 45000, currency: "INR",
        status: "captured", method: "upi", captured: true, error_code: null, error_description: null,
    };
    gatewayOrderPayments = [gatewayPayment];
});

describe("late UPI success — webhook capture after a stored failure", () => {
    it("upgrades the failed row to succeeded, conditionally on it still being failed", async () => {
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_captured");

        const update = upgradeUpdate();
        expect(update).toBeDefined();
        expect(written(update, "status")).toBe("succeeded");
        expect(written(update, "captured_at")).toEqual(expect.any(String));
        expect(written(update, "failure_code")).toBeNull();
        expect(written(update, "failure_reason")).toBeNull();
        expect(update.filters).toEqual(expect.arrayContaining([
            ["eq", "id", FAILED_TXN],
            ["eq", "status", "failed"],
        ]));
        // Never touches amount / order / pay_id — the DB guard rejects those.
        expect(update.payload).not.toHaveProperty("amount");
        expect(update.payload).not.toHaveProperty("payment_order_id");
        expect(update.payload).not.toHaveProperty("gateway_payment_id");
        // Keeps the failure payload for support.
        expect((written(update, "raw_payload") as Record<string, unknown>).previous_failed_payload)
            .toEqual({ status: "failed" });
    });

    it("then applies it exactly like a fresh capture: order paid, money allocated to the bill", async () => {
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_captured");

        const orderPaid = fake.on("payment_orders", "update").find((u) => written(u, "status") === "paid");
        expect(orderPaid).toBeDefined();

        const allocations = fake.on("payment_allocations", "insert");
        expect(allocations).toHaveLength(1);
        expect(written(allocations[0], "payment_transaction_id")).toBe(FAILED_TXN);
        expect(written(allocations[0], "invoice_id")).toBe("invoice-1");
        expect(written(allocations[0], "amount")).toBe(450);
    });

    it("tells the rider it succeeded and writes the upgrade to the audit log", async () => {
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_captured");

        const actions = writeAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
        expect(actions).toContain("payment.failed_txn_upgraded");
        const upgradeAudit = writeAudit.mock.calls
            .map((c) => c[0] as { action: string; entityId: string; before: Record<string, unknown> })
            .find((e) => e.action === "payment.failed_txn_upgraded")!;
        expect(upgradeAudit.entityId).toBe(FAILED_TXN);
        expect(upgradeAudit.before.status).toBe("failed");

        const titles = notifyUser.mock.calls.map((c) => (c[1] as { title: string }).title);
        expect(titles).toContain("Late Fee Payment Successful");
        expect(titles).not.toContain("Payment Failed");
    });

    it("marks the webhook processed (no silent drop, no error)", async () => {
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_captured");

        const updates = fake.on("payment_webhook_events", "update");
        expect(updates.some((u) => u.payload?.processed_at)).toBe(true);
        expect(updates.some((u) => u.payload?.processing_error)).toBe(false);
    });

    it("works for order.paid too", async () => {
        const { body, signature } = webhook("order.paid");
        await handleWebhook(body, signature, "evt_order_paid");

        expect(upgradeUpdate()).toBeDefined();
        expect(fake.on("payment_allocations", "insert")).toHaveLength(1);
    });

    it("activates a first-period booking once its invoice is settled", async () => {
        install({ existingStatus: "failed", invoicePurpose: "subscription_period", isPaid: true });
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_captured");

        const confirmed = fake.on("bookings", "update").some((u) => written(u, "status") === "confirmed");
        expect(confirmed).toBe(true);
    });

    it("creates the booking for a pay-first booking order, against the upgraded transaction", async () => {
        install({ existingStatus: "failed", purpose: "booking" });
        const rpcCalls: Array<[string, unknown]> = [];
        rpcHandler = (fn, args) => {
            rpcCalls.push([fn, args]);
            return { error: { code: "XX000", message: "stop here" } };
        };
        const { body, signature } = webhook("payment.captured");
        // The booking RPC is made to fail so the test stops right after it is
        // reached — what matters is that it IS reached for a late success.
        await expect(handleWebhook(body, signature, "evt_captured")).rejects.toBeTruthy();

        expect(upgradeUpdate()).toBeDefined();
        expect(rpcCalls.map((c) => c[0])).toContain("create_booking_from_order");
    });
});

describe("late UPI success — what is NOT upgraded", () => {
    it("a genuine duplicate (row already succeeded) is still a no-op", async () => {
        install({ existingStatus: "succeeded" });
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_dup");

        expect(fake.on("payment_transactions", "update")).toHaveLength(0);
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
        expect(fake.on("payment_orders", "update")).toHaveLength(0);
    });

    it("losing the race to another caller applies nothing a second time", async () => {
        // verify and the webhook both see the failed row; the other one's
        // conditional UPDATE won, ours matches zero rows.
        install({ existingStatus: "failed", upgradeWins: false });
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_race");

        expect(upgradeUpdate()).toBeDefined();
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
        expect(fake.on("payment_orders", "update")).toHaveLength(0);
        const actions = writeAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
        expect(actions).not.toContain("payment.failed_txn_upgraded");
    });

    it("a failed row on a DIFFERENT order is refused loudly, not applied and not swallowed", async () => {
        install({ existingStatus: "failed", existingOrderId: "some-other-order" });
        const { body, signature } = webhook("payment.captured");
        await expect(handleWebhook(body, signature, "evt_other")).rejects.toThrow(/different|not order-uuid-1/i);

        expect(fake.on("payment_transactions", "update")).toHaveLength(0);
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
        const updates = fake.on("payment_webhook_events", "update");
        expect(updates.some((u) => u.payload?.processing_error)).toBe(true);
        expect(updates.some((u) => u.payload?.processed_at)).toBe(false);
    });

    it("an amount that differs from the failed attempt is refused loudly", async () => {
        install({ existingStatus: "failed", existingAmount: 300 });
        const { body, signature } = webhook("payment.captured");
        await expect(handleWebhook(body, signature, "evt_amount")).rejects.toThrow(/captured 450/);

        expect(fake.on("payment_transactions", "update")).toHaveLength(0);
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
    });

    it("a normal capture (no earlier failure) still inserts and never updates", async () => {
        install({ existingStatus: null });
        const { body, signature } = webhook("payment.captured");
        await handleWebhook(body, signature, "evt_normal");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(1);
        expect(fake.on("payment_transactions", "update")).toHaveLength(0);
        const allocations = fake.on("payment_allocations", "insert");
        expect(written(allocations[0], "payment_transaction_id")).toBe("txn-new");
    });
});

describe("late UPI success — the other entry points", () => {
    it("client verify: a captured payment whose failure was stored earlier is applied", async () => {
        await verifyPayment({
            razorpay_order_id: GW_ORDER,
            razorpay_payment_id: PAY_ID,
            razorpay_signature: checkoutSignature(GW_ORDER, PAY_ID),
        }, RIDER);

        expect(upgradeUpdate()).toBeDefined();
        expect(written(upgradeUpdate(), "gateway_signature")).toBe(checkoutSignature(GW_ORDER, PAY_ID));
        expect(fake.on("payment_allocations", "insert")).toHaveLength(1);
    });

    it("order sync (app reopened): a captured payment whose failure was stored earlier is applied", async () => {
        const result = await syncOrderPayment(GW_ORDER, RIDER);

        expect(result.status).toBe("paid");
        expect(upgradeUpdate()).toBeDefined();
        expect(fake.on("payment_allocations", "insert")).toHaveLength(1);
    });
});

describe("payment.failed arriving AFTER the capture (out-of-order webhooks)", () => {
    it("does not tell the rider or admins the payment failed when the order is already paid", async () => {
        install({ existingStatus: "succeeded", orderStatus: "paid" });
        const { body, signature } = webhook("payment.failed", {
            error_code: "BAD_REQUEST_ERROR",
            error_description: "delay in response from the UPI app",
        });
        await handleWebhook(body, signature, "evt_late_failed");

        expect(notifyUser).not.toHaveBeenCalled();
        expect(notify).not.toHaveBeenCalled();
        const actions = writeAudit.mock.calls.map((c) => (c[0] as { action: string }).action);
        expect(actions).not.toContain("payment.failed");
    });

    it("still notifies a genuine failure on an unpaid order", async () => {
        install({ existingStatus: null, orderStatus: "failed" });
        const { body, signature } = webhook("payment.failed", {
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Card declined by issuer.",
        });
        await handleWebhook(body, signature, "evt_failed");

        const failedRow = fake.on("payment_transactions", "insert")[0];
        expect(written(failedRow, "status")).toBe("failed");
        const titles = notifyUser.mock.calls.map((c) => (c[1] as { title: string }).title);
        expect(titles).toContain("Payment Failed");
        expect(notify).toHaveBeenCalled();
    });

    it("full sequence: failed, then captured — ends paid and allocated", async () => {
        // Step 1: the failure lands first and is stored.
        install({ existingStatus: null, orderStatus: "attempted" });
        const failed = webhook("payment.failed", {
            error_code: "BAD_REQUEST_ERROR",
            error_description: "delay in response from the UPI app",
        });
        await handleWebhook(failed.body, failed.signature, "evt_seq_1");
        expect(written(fake.on("payment_transactions", "insert")[0], "status")).toBe("failed");

        // Step 2: the capture for the SAME pay_id — the failed row now exists.
        install({ existingStatus: "failed", orderStatus: "failed" });
        const captured = webhook("payment.captured");
        await handleWebhook(captured.body, captured.signature, "evt_seq_2");

        expect(written(upgradeUpdate(), "status")).toBe("succeeded");
        expect(fake.on("payment_orders", "update").some((u) => written(u, "status") === "paid")).toBe(true);
        expect(fake.on("payment_allocations", "insert")).toHaveLength(1);
    });
});
