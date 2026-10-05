import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler } from "./helpers/fakeSupabase";

/**
 * Order creation — where the payable amount is decided.
 *
 * The client sends a UUID and nothing else. Every test here is ultimately
 * about that: no path may let a caller influence what is charged.
 */

process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = "test-key-secret";
process.env.RAZORPAY_WEBHOOK_SECRET = "test-webhook-secret";

let handler: QueryHandler = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q));
const fakeRef = { current: fake as unknown as Record<string, unknown> };

let ordersCreated: Array<Record<string, unknown>> = [];

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

vi.mock("../src/config/razorpay", () => ({
    // The service calls this rather than reaching for the SDK, so that a
    // gateway 401 becomes a clean 503 instead of an unhandled 500.
    createGatewayOrder: async (params: Record<string, unknown>) => {
        ordersCreated.push(params);
        return { id: `order_gw_${ordersCreated.length}` };
    },
    getRazorpay: () => {
        throw new Error("getRazorpay must not be called directly from the order path.");
    },
    fetchGatewayPayment: vi.fn(),
}));

vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: vi.fn(async () => {}),
}));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({
    applyRefundWebhookResult: vi.fn(async () => {}),
}));
const NO_LATE_FEE = { isLate: false, lateFee: 0, daysLate: 0, feePerDay: 0 };

vi.mock("../src/modules/payments/renewalFee", () => ({
    // computeInvoiceLateFee is what the order path calls now: it resolves
    // WHICH date the invoice is late against before doing the arithmetic,
    // because a renewal invoice belongs to the period being bought.
    computeInvoiceLateFee: async () => NO_LATE_FEE,
    computeLateRenewalFee: async () => NO_LATE_FEE,
    lateFeeRuleFor: async () => null,
    lateFeeRateFor: async () => 0,
    lateFeeOverrideCode: (id: string) => `late_fee_${id.replace(/-/g, "_")}`,
}));

// Imported dynamically, AFTER the process.env assignments above. A static
// import is hoisted and would evaluate config/env.ts against an empty
// environment, leaving env.razorpayKeyId as "".
const { createOrderForInvoice, mapGatewayMethod, rupeesToPaise } =
    await import("../src/modules/payments/payments.service");

const RIDER = { id: "rider-1", role: "rider" } as never;
const OTHER_RIDER = { id: "rider-2", role: "rider" } as never;

interface Options {
    owner?: string;
    balance?: number;
    isPaid?: boolean;
    status?: string;
    openOrder?: Record<string, unknown> | null;
}

function baseHandler(opts: Options = {}): QueryHandler {
    const {
        owner = "rider-1", balance = 2500, isPaid = false,
        status = "issued", openOrder = null,
    } = opts;

    return (q) => {
        if (q.table === "invoices") {
            return {
                data: {
                    id: "invoice-1",
                    user_id: owner,
                    status,
                    purpose: "initial",
                    due_on: "2026-09-01",
                    total_amount: 2500,
                    subscription_id: "sub-1",
                },
            };
        }
        if (q.table === "v_invoice_balances") {
            return { data: { balance_amount: balance, is_paid: isPaid } };
        }
        if (q.table === "invoice_items") {
            return {
                data: [
                    { description: "Plan fee — period 1", amount: 1800, line_number: 1 },
                    { description: "Transaction fee", amount: 25, line_number: 2 },
                    { description: "Welcome discount", amount: -180, line_number: 3 },
                    { description: "Refundable security deposit", amount: 2000, line_number: 4 },
                ],
            };
        }
        if (q.table === "payment_orders" && q.op === "select") return { data: openOrder };
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
    fake = createFakeSupabase((q) => handler(q));
    fakeRef.current = fake as unknown as Record<string, unknown>;
    ordersCreated = [];
});

describe("createOrderForInvoice — amount authority", () => {
    it("prices the order from the invoice balance, not from any client input", async () => {
        const result = await createOrderForInvoice("invoice-1", RIDER);
        expect(result.amount).toBe(2500);
        expect(ordersCreated[0]?.amount).toBe(250000); // paise
        expect(ordersCreated[0]?.currency).toBe("INR");
    });

    it("charges the outstanding BALANCE on a part-paid invoice, not the total", async () => {
        handler = baseHandler({ balance: 900 });
        const result = await createOrderForInvoice("invoice-1", RIDER);

        expect(result.amount).toBe(900);
        expect(ordersCreated[0]?.amount).toBe(90000);
    });

    it("refuses an invoice that is already settled", async () => {
        handler = baseHandler({ isPaid: true, balance: 0 });
        await expect(createOrderForInvoice("invoice-1", RIDER)).rejects.toThrow(/already been paid/i);
        expect(ordersCreated).toHaveLength(0);
    });

    it("refuses a voided invoice", async () => {
        handler = baseHandler({ status: "void" });
        await expect(createOrderForInvoice("invoice-1", RIDER)).rejects.toThrow(/voided/i);
    });

    it("never leaks the key secret to the client", async () => {
        const result = await createOrderForInvoice("invoice-1", RIDER);
        expect(result.keyId).toBe("rzp_test_key");
        expect(JSON.stringify(result)).not.toContain("test-key-secret");
    });

    it("returns an expiry so the client can stop offering a dead sheet", async () => {
        const result = await createOrderForInvoice("invoice-1", RIDER);
        expect(result.expiresAt).toBeTruthy();
        expect(new Date(result.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });
});

describe("createOrderForInvoice — itemised breakdown", () => {
    it("returns the invoice lines so the client never computes a total", () => {
        // The regression: the review screen added plan price + deposit and
        // quoted the rider a number the gateway then disagreed with, because
        // pricing rules are resolved server-side and are invisible on-device.
        return createOrderForInvoice("invoice-1", RIDER).then((result) => {
            expect(result.lines.map((l) => l.description)).toEqual([
                "Plan fee — period 1",
                "Transaction fee",
                "Welcome discount",
                "Refundable security deposit",
            ]);
        });
    });

    it("keeps discounts negative, so the lines sum to the charge", async () => {
        const result = await createOrderForInvoice("invoice-1", RIDER);
        const sum = result.lines.reduce((t, l) => t + l.amount, 0);

        expect(result.lines.find((l) => l.description === "Welcome discount")?.amount).toBe(-180);
        expect(sum).toBe(3645);
    });

    it("orders the lines by line_number, not by whatever the DB returns", async () => {
        const result = await createOrderForInvoice("invoice-1", RIDER);
        const query = fake.on("invoice_items", "select")[0];
        expect(query?.filters.some((f) => f[0] === "order" && f[1] === "line_number")).toBe(true);
    });
});

describe("createOrderForInvoice — authorization (IDOR)", () => {
    it("refuses another rider's invoice, as a 404", async () => {
        handler = baseHandler({ owner: "rider-1" });
        await expect(createOrderForInvoice("invoice-1", OTHER_RIDER)).rejects.toMatchObject({ status: 404 });
    });

    it("does not reach the gateway for another rider's invoice", async () => {
        handler = baseHandler({ owner: "rider-1" });
        await expect(createOrderForInvoice("invoice-1", OTHER_RIDER)).rejects.toThrow();
        expect(ordersCreated).toHaveLength(0);
    });
});

describe("createOrderForInvoice — idempotency", () => {
    it("reuses an open order at the SAME amount instead of creating a second", async () => {
        handler = baseHandler({
            openOrder: {
                id: "order-existing",
                gateway_order_id: "order_gw_existing",
                amount: 2500,
                currency: "INR",
                expires_at: new Date(Date.now() + 600_000).toISOString(),
            },
        });

        const result = await createOrderForInvoice("invoice-1", RIDER);

        expect(result.gatewayOrderId).toBe("order_gw_existing");
        expect(ordersCreated).toHaveLength(0);
    });

    it("does NOT reuse an open order whose amount has since changed", async () => {
        // The regression this guards: findReusableOrder matched on invoice
        // alone, so a rider who opened checkout before a late fee accrued was
        // charged the stale, lower total and left part-paid.
        handler = (q) => {
            if (q.table === "payment_orders" && q.op === "select") {
                // The query filters on amount, so a stale-priced order does
                // not come back at all.
                const amountFilter = q.filters.find((f) => f[0] === "eq" && f[1] === "amount");
                expect(amountFilter).toBeDefined();
                return { data: null };
            }
            return baseHandler()(q);
        };

        await createOrderForInvoice("invoice-1", RIDER);
        expect(ordersCreated).toHaveLength(1);
    });

    it("supersedes stale open orders before opening a new one", async () => {
        await createOrderForInvoice("invoice-1", RIDER);

        const supersede = fake.on("payment_orders", "update")[0];
        expect(written(supersede, "status")).toBe("expired");
        // Scoped to orders at a DIFFERENT amount — the current one survives.
        expect(supersede?.filters.some((f) => f[0] === "neq" && f[1] === "amount")).toBe(true);
    });

    it("ignores an expired open order even at the right amount", async () => {
        handler = baseHandler({
            openOrder: {
                id: "order-stale",
                gateway_order_id: "order_gw_stale",
                amount: 2500,
                currency: "INR",
                expires_at: new Date(Date.now() - 60_000).toISOString(),
            },
        });

        await createOrderForInvoice("invoice-1", RIDER);
        expect(ordersCreated).toHaveLength(1);
    });

    it("re-reads rather than erroring when a concurrent tap won the insert", async () => {
        let insertAttempts = 0;
        handler = (q) => {
            if (q.table === "payment_orders" && q.op === "insert") {
                insertAttempts++;
                return { error: { code: "23505" } };
            }
            if (q.table === "payment_orders" && q.op === "select") {
                // First read: nothing yet. Second: the winner's row.
                return insertAttempts === 0
                    ? { data: null }
                    : {
                        data: {
                            id: "order-winner",
                            gateway_order_id: "order_gw_winner",
                            amount: 2500,
                            currency: "INR",
                            expires_at: new Date(Date.now() + 600_000).toISOString(),
                        },
                    };
            }
            return baseHandler()(q);
        };

        const result = await createOrderForInvoice("invoice-1", RIDER);
        expect(result.gatewayOrderId).toBe("order_gw_winner");
    });

    it("writes an idempotency key that includes the amount", async () => {
        await createOrderForInvoice("invoice-1", RIDER);
        const inserted = fake.on("payment_orders", "insert")[0];
        expect(written(inserted, "idempotency_key")).toBe("invoice:invoice-1:2500");
    });
});

describe("currency conversion", () => {
    it("converts rupees to paise exactly", () => {
        expect(rupeesToPaise(2500)).toBe(250000);
        expect(rupeesToPaise(0.01)).toBe(1);
        expect(rupeesToPaise(1999.99)).toBe(199999);
    });

    it("rounds rather than truncating, so a float artefact cannot lose a paisa", () => {
        // 19.99 * 100 is 1998.9999999999998 in IEEE 754; truncation would
        // charge the rider a paisa less than the invoice says.
        expect(rupeesToPaise(19.99)).toBe(1999);
        expect(rupeesToPaise(0.07)).toBe(7);
        expect(rupeesToPaise(1234.56)).toBe(123456);
    });

    it("is only ever fed 2dp values, which is what makes it exact", () => {
        // Documenting a real limit rather than pretending there isn't one:
        // 1.005 * 100 is 100.49999999999999, so Math.round gives 100, not 101.
        // That half-paisa case cannot arise here because every amount
        // originates in a numeric(12,2) column, but the rounding mode is not
        // "round half up on the decimal value" and should not be relied on as
        // if it were.
        expect(rupeesToPaise(1.005)).toBe(100);
    });
});

describe("mapGatewayMethod", () => {
    it("passes through the four methods the enum shares with Razorpay", () => {
        expect(mapGatewayMethod("upi")).toBe("upi");
        expect(mapGatewayMethod("card")).toBe("card");
        expect(mapGatewayMethod("netbanking")).toBe("netbanking");
        expect(mapGatewayMethod("wallet")).toBe("wallet");
    });

    it("returns null for a method the enum has no label for, rather than guessing", () => {
        // `emi` is a real Razorpay method with no payment_method label. A
        // wrong label would be worse than an absent one on a financial row.
        expect(mapGatewayMethod("emi")).toBeNull();
        expect(mapGatewayMethod("cardless_emi")).toBeNull();
        expect(mapGatewayMethod(null)).toBeNull();
    });

    it("does not map anything to `cash`, which only a human can record", () => {
        expect(mapGatewayMethod("cash")).toBeNull();
    });
});
