import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler } from "./helpers/fakeSupabase";
import type { GatewayPayment } from "../src/config/razorpay";

/**
 * `POST /payments/verify` — the rider's app reporting what Checkout returned.
 *
 * The whole point of these tests is that a VALID SIGNATURE IS NOT ENOUGH.
 * Razorpay computes the checkout signature when the payment is created, so it
 * is equally valid for a payment that is merely authorized, one that is later
 * voided, and one that failed. Releasing a scooter on the signature alone
 * releases it against money that may never settle.
 */

const KEY_SECRET = "test-key-secret";
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";

let handler: QueryHandler = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q));
const fakeRef = { current: fake as unknown as Record<string, unknown> };

let gatewayPayment: GatewayPayment;
let fetchCalls: string[] = [];

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

vi.mock("../src/config/razorpay", () => ({
    getRazorpay: () => ({ orders: { create: vi.fn() } }),
    fetchGatewayPayment: async (id: string) => {
        fetchCalls.push(id);
        return gatewayPayment;
    },
}));

vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: vi.fn(async () => {}),
}));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({
    applyRefundWebhookResult: vi.fn(async () => {}),
}));

const { verifyPayment } = await import("../src/modules/payments/payments.service");

const RIDER = { id: "rider-1", role: "rider" } as never;
const OTHER_RIDER = { id: "rider-2", role: "rider" } as never;

const ORDER_ID = "order_real01";
const PAYMENT_ID = "pay_real01";

function checkoutSignature(orderId: string, paymentId: string, secret = KEY_SECRET): string {
    return createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

function payload(overrides: Partial<Record<"razorpay_order_id" | "razorpay_payment_id" | "razorpay_signature", string>> = {}) {
    const orderId = overrides.razorpay_order_id ?? ORDER_ID;
    const paymentId = overrides.razorpay_payment_id ?? PAYMENT_ID;
    return {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: overrides.razorpay_signature ?? checkoutSignature(orderId, paymentId),
    };
}

function baseHandler(orderOwner = "rider-1"): QueryHandler {
    return (q) => {
        if (q.table === "payment_orders" && q.op === "select") {
            return {
                data: {
                    id: "order-uuid-1",
                    user_id: orderOwner,
                    amount: 2500,
                    currency: "INR",
                    invoice_id: "invoice-1",
                    invoices: {
                        purpose: "initial",
                        subscription_id: "sub-1",
                        subscription_period_id: "period-1",
                        total_amount: 2500,
                    },
                },
            };
        }
        if (q.table === "payment_transactions" && q.op === "insert") return { data: { id: "txn-1" } };
        if (q.table === "v_invoice_balances") return { data: { balance_amount: 2500, is_paid: true } };
        if (q.table === "payment_allocations") return { data: { id: "alloc-1" } };
        if (q.table === "subscriptions") return { data: { id: "sub-1", booking_id: "booking-1" } };
        if (q.table === "bookings") return { data: { id: "booking-1" } };
        return { data: null };
    };
}

beforeEach(() => {
    handler = baseHandler();
    fake = createFakeSupabase((q) => handler(q));
    fakeRef.current = fake as unknown as Record<string, unknown>;
    fetchCalls = [];
    gatewayPayment = {
        id: PAYMENT_ID,
        order_id: ORDER_ID,
        amount: 250000,
        currency: "INR",
        status: "captured",
        method: "upi",
        captured: true,
        error_code: null,
        error_description: null,
    };
});

describe("verifyPayment — signature", () => {
    it("accepts a genuine signature for a captured payment", async () => {
        await expect(verifyPayment(payload(), RIDER)).resolves.toBeUndefined();
        expect(fake.on("payment_transactions", "insert")).toHaveLength(1);
    });

    it("rejects a forged signature", async () => {
        await expect(
            verifyPayment(payload({ razorpay_signature: "0".repeat(64) }), RIDER),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("rejects a signature minted with a different secret", async () => {
        await expect(
            verifyPayment(
                payload({ razorpay_signature: checkoutSignature(ORDER_ID, PAYMENT_ID, "attacker-secret") }),
                RIDER,
            ),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("rejects a signature that was valid for a DIFFERENT payment id", async () => {
        await expect(
            verifyPayment(
                {
                    razorpay_order_id: ORDER_ID,
                    razorpay_payment_id: "pay_substituted",
                    razorpay_signature: checkoutSignature(ORDER_ID, PAYMENT_ID),
                },
                RIDER,
            ),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("never contacts the gateway when the signature fails", async () => {
        await expect(
            verifyPayment(payload({ razorpay_signature: "bad" }), RIDER),
        ).rejects.toThrow();
        expect(fetchCalls).toHaveLength(0);
    });
});

describe("verifyPayment — authorization (IDOR)", () => {
    it("refuses another rider's payment order, as a 404", async () => {
        handler = baseHandler("rider-1");
        await expect(verifyPayment(payload(), OTHER_RIDER)).rejects.toMatchObject({ status: 404 });
    });

    it("does not record anything against another rider's order", async () => {
        handler = baseHandler("rider-1");
        await expect(verifyPayment(payload(), OTHER_RIDER)).rejects.toThrow();
        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
    });

    it("returns 404 rather than 403 for an unknown order, so it is not an existence oracle", async () => {
        handler = (q) => {
            if (q.table === "payment_orders") return { data: null };
            return baseHandler()(q);
        };
        await expect(verifyPayment(payload(), RIDER)).rejects.toMatchObject({ status: 404 });
    });
});

describe("verifyPayment — settlement, not just authenticity", () => {
    it("refuses an AUTHORIZED-but-uncaptured payment", async () => {
        gatewayPayment = { ...gatewayPayment, status: "authorized", captured: false };

        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/still being confirmed/i);
        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
    });

    it("marks the order attempted when the payment is authorized, so the hold survives", async () => {
        gatewayPayment = { ...gatewayPayment, status: "authorized", captured: false };
        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow();

        const updates = fake.on("payment_orders", "update");
        expect(updates.some((u) => u.payload?.status === "attempted")).toBe(true);
    });

    it("refuses a payment whose `captured` flag is false even if status says captured", async () => {
        gatewayPayment = { ...gatewayPayment, status: "captured", captured: false };
        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/still being confirmed/i);
    });

    it("records a declined attempt and reports the gateway's reason", async () => {
        gatewayPayment = {
            ...gatewayPayment,
            status: "failed",
            captured: false,
            error_code: "BAD_REQUEST_ERROR",
            error_description: "Insufficient funds.",
        };

        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/insufficient funds/i);

        const txn = fake.on("payment_transactions", "insert")[0];
        expect(written(txn, "status")).toBe("failed");
        expect(written(txn, "failure_code")).toBe("BAD_REQUEST_ERROR");
        expect(written(txn, "captured_at")).toBeNull();
    });
});

describe("verifyPayment — amount and order binding", () => {
    it("rejects a payment belonging to a different Razorpay order", async () => {
        // A genuine, captured payment from ANOTHER order, replayed here.
        gatewayPayment = { ...gatewayPayment, order_id: "order_someone_else" };

        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/does not belong to this order/i);
        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
    });

    it("rejects an under-captured amount", async () => {
        gatewayPayment = { ...gatewayPayment, amount: 100 };
        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/amount does not match/i);
    });

    it("rejects an over-captured amount", async () => {
        gatewayPayment = { ...gatewayPayment, amount: 500000 };
        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/amount does not match/i);
    });

    it("rejects a currency mismatch", async () => {
        gatewayPayment = { ...gatewayPayment, currency: "USD" };
        await expect(verifyPayment(payload(), RIDER)).rejects.toThrow(/currency does not match/i);
    });

    it("records the GATEWAY's amount and method, not the order's", async () => {
        gatewayPayment = { ...gatewayPayment, method: "card" };
        await verifyPayment(payload(), RIDER);

        const txn = fake.on("payment_transactions", "insert")[0];
        expect(written(txn, "amount")).toBe(2500);
        expect(written(txn, "method")).toBe("card");
        expect(written(txn, "status")).toBe("succeeded");
    });

    it("asks the gateway exactly once, for the payment id the client supplied", async () => {
        await verifyPayment(payload(), RIDER);
        expect(fetchCalls).toEqual([PAYMENT_ID]);
    });
});

describe("verifyPayment — double submission", () => {
    it("is a no-op when the transaction already exists", async () => {
        handler = (q) => {
            if (q.table === "payment_transactions" && q.op === "insert") {
                return { error: { code: "23505" } };
            }
            return baseHandler()(q);
        };

        await expect(verifyPayment(payload(), RIDER)).resolves.toBeUndefined();
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
    });
});
