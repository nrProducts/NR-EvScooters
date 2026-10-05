import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler } from "./helpers/fakeSupabase";

/**
 * Pay-first booking checkout — `createBookingOrder`.
 *
 * The client sends { plan_id, vehicle_model_id, station_id, start_day } and
 * NOTHING about price. Every test here is about that boundary: the amount comes
 * from the server quote, and the row written is a "booking intent" order, not a
 * booking.
 */

process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";

let handler: QueryHandler = () => ({ data: null });
let rpcHandler: (fn: string, args: unknown) => { data?: unknown; error?: unknown } = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q), (fn, a) => rpcHandler(fn, a));
const fakeRef = { current: fake as unknown as Record<string, unknown> };

let ordersCreated: Array<Record<string, unknown>> = [];

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

vi.mock("../src/config/razorpay", () => ({
    createGatewayOrder: async (params: Record<string, unknown>) => {
        ordersCreated.push(params);
        return { id: `order_gw_${ordersCreated.length}` };
    },
    getRazorpay: () => {
        throw new Error("getRazorpay must not be called from the order path.");
    },
    fetchGatewayPayment: vi.fn(),
}));

vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({ notifyUser: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({ applyRefundWebhookResult: vi.fn(async () => {}) }));
vi.mock("../src/modules/referrals/referrals.service", () => ({
    qualifyReferralIfApplicable: vi.fn(async () => ({ discount_amount: 0 })),
}));
vi.mock("../src/modules/payments/renewalFee", () => ({
    computeInvoiceLateFee: async () => ({ isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 }),
    computeLateRenewalFee: async () => ({ isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 }),
    lateFeeRuleFor: async () => null,
    lateFeeRateFor: async () => 0,
    lateFeeOverrideCode: (id: string) => `late_fee_${id.replace(/-/g, "_")}`,
}));

const { createBookingOrder } = await import("../src/modules/payments/payments.service");

const RIDER = { id: "rider-1", role: "rider" } as never;
const INPUT = {
    plan_id: "plan-1",
    vehicle_model_id: "model-1",
    station_id: "hub-1",
    start_day: "2026-09-07", // a Monday
};

function baseHandler(openBookingOrder: Record<string, unknown> | null = null): QueryHandler {
    return (q) => {
        // hasActiveBookingForUser / hasActiveRentalForUser — the fake has no
        // count support, so these resolve to "not active" (count undefined).
        if (q.table === "bookings" || q.table === "rentals") return { data: null };
        if (q.table === "plans") {
            return {
                data: {
                    id: "plan-1", is_active: true, vehicle_model_id: "model-1",
                    price_amount: 1800, duration_days: 7, deposit_amount: 2000,
                    billing_period: "weekly",
                },
            };
        }
        if (q.table === "v_vehicle_availability") return { data: [{ vehicle_count: 3 }] };
        if (q.table === "payment_orders" && q.op === "select") return { data: openBookingOrder };
        if (q.table === "payment_orders" && q.op === "update") return { data: [] };
        if (q.table === "payment_orders" && q.op === "insert") {
            return {
                data: {
                    id: "order-uuid-new",
                    gateway_order_id: "order_gw_1",
                    amount: q.payload?.amount,
                    currency: "INR",
                    expires_at: q.payload?.expires_at,
                },
            };
        }
        return { data: null };
    };
}

beforeEach(() => {
    handler = baseHandler();
    // quote_plan_first_period: plan fee 1800, welcome discount -180, deposit 2000 => 3620
    rpcHandler = (fn) => {
        if (fn === "quote_plan_first_period") {
            return {
                data: [
                    { description: "Plan fee — period 1", amount: 1800 },
                    { description: "Welcome discount", amount: -180 },
                    { description: "Refundable security deposit", amount: 2000 },
                ],
            };
        }
        return { data: null };
    };
    fake = createFakeSupabase((q) => handler(q), (fn, a) => rpcHandler(fn, a));
    fakeRef.current = fake as unknown as Record<string, unknown>;
    ordersCreated = [];
});

describe("createBookingOrder — amount authority", () => {
    it("prices the order from the server quote, not from client input", async () => {
        const result = await createBookingOrder(INPUT, RIDER);
        expect(result.amount).toBe(3620);
        expect(ordersCreated[0]?.amount).toBe(362000); // paise
        expect(ordersCreated[0]?.currency).toBe("INR");
    });

    it("returns the itemised quote lines", async () => {
        const result = await createBookingOrder(INPUT, RIDER);
        expect(result.lines).toEqual([
            { description: "Plan fee — period 1", amount: 1800 },
            { description: "Welcome discount", amount: -180 },
            { description: "Refundable security deposit", amount: 2000 },
        ]);
    });

    it("never leaks the key secret", async () => {
        const result = await createBookingOrder(INPUT, RIDER);
        expect(result.keyId).toBe("rzp_test_key");
        expect(JSON.stringify(result)).not.toContain("test-key-secret");
    });
});

describe("createBookingOrder — writes a booking INTENT, not a booking", () => {
    it("inserts a payment_orders row with purpose 'booking' and the snapshot, no invoice", async () => {
        await createBookingOrder(INPUT, RIDER);
        const insert = fake.on("payment_orders", "insert")[0];
        expect(written(insert, "purpose")).toBe("booking");
        expect(written(insert, "invoice_id")).toBeUndefined();
        const intent = written(insert, "booking_intent") as Record<string, unknown>;
        expect(intent).toMatchObject({
            user_id: "rider-1",
            plan_id: "plan-1",
            vehicle_model_id: "model-1",
            hub_id: "hub-1",
            requested_start_on: "2026-09-07",
            plan_price_snapshot: 1800,
            duration_days_snapshot: 7,
            deposit_amount_snapshot: 2000,
            billing_period_snapshot: "weekly",
        });
    });

    it("never touches the bookings, subscriptions, deposits or invoices tables", async () => {
        await createBookingOrder(INPUT, RIDER);
        expect(fake.on("bookings", "insert")).toHaveLength(0);
        expect(fake.on("subscriptions", "insert")).toHaveLength(0);
        expect(fake.on("deposits", "insert")).toHaveLength(0);
        expect(fake.on("invoices", "insert")).toHaveLength(0);
    });

    it("keys idempotency on rider + plan + start_day + amount", async () => {
        await createBookingOrder(INPUT, RIDER);
        const insert = fake.on("payment_orders", "insert")[0];
        expect(written(insert, "idempotency_key")).toBe("booking:rider-1:plan-1:2026-09-07:3620");
    });
});

describe("createBookingOrder — retry reuses the one open intent", () => {
    it("returns the existing open order instead of creating a second", async () => {
        handler = baseHandler({
            id: "order-existing",
            gateway_order_id: "order_gw_existing",
            amount: 3620,
            currency: "INR",
            expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
            status: "created",
        });
        const result = await createBookingOrder(INPUT, RIDER);
        expect(result.orderId).toBe("order-existing");
        expect(ordersCreated).toHaveLength(0); // no new gateway order
    });
});

describe("createBookingOrder — plan guard", () => {
    it("rejects a plan that does not belong to the chosen model", async () => {
        handler = (q) => {
            if (q.table === "plans") {
                return { data: { id: "plan-1", is_active: true, vehicle_model_id: "other-model", price_amount: 1, duration_days: 7, deposit_amount: 0, billing_period: "weekly" } };
            }
            return baseHandler()(q);
        };
        await expect(createBookingOrder(INPUT, RIDER)).rejects.toThrow(/does not apply/i);
        expect(ordersCreated).toHaveLength(0);
    });

    it("rejects when no vehicle of that model is free at the station", async () => {
        handler = (q) => {
            if (q.table === "v_vehicle_availability") return { data: [{ vehicle_count: 0 }] };
            return baseHandler()(q);
        };
        await expect(createBookingOrder(INPUT, RIDER)).rejects.toThrow(/no scooters/i);
        expect(ordersCreated).toHaveLength(0);
    });
});
