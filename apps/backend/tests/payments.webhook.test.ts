import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryHandler } from "./helpers/fakeSupabase";

/**
 * Webhook security and idempotency.
 *
 * This is the authoritative path — the one that decides a rider's booking is
 * confirmed when the app never came back — so it is tested through
 * `handleWebhook` itself rather than through extracted helpers. Everything
 * below exercises the real control flow with Supabase and Razorpay faked at
 * the module boundary.
 */

const WEBHOOK_SECRET = "test-webhook-secret";
const KEY_SECRET = "test-key-secret";

process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
process.env.RAZORPAY_KEY_ID = "rzp_test_key";
process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;

let handler: QueryHandler = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q));

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

// A live reference so each test can install a fresh fake without re-mocking.
const fakeRef = { current: fake as unknown as Record<string, unknown> };

vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));
vi.mock("../src/modules/notifications/notifications.service", () => ({
    notifyUser: vi.fn(async () => {}),
}));
vi.mock("../src/modules/notifications/notify.service", () => ({ notify: vi.fn(async () => {}) }));
vi.mock("../src/modules/refunds/refunds.service", () => ({
    applyRefundWebhookResult: vi.fn(async () => {}),
}));

const { handleWebhook } = await import("../src/modules/payments/payments.service");

function sign(body: string, secret = WEBHOOK_SECRET): string {
    return createHmac("sha256", secret).update(body).digest("hex");
}

function capturedEvent(overrides: Record<string, unknown> = {}) {
    return {
        event: "payment.captured",
        payload: {
            payment: {
                entity: {
                    id: "pay_realpayment01",
                    order_id: "order_real01",
                    amount: 250000,
                    currency: "INR",
                    method: "upi",
                    ...overrides,
                },
            },
        },
    };
}

/** Default handler: an order exists, nothing has been paid yet. */
function baseHandler(state: { webhookProcessedAt?: string | null } = {}): QueryHandler {
    return (q) => {
        if (q.table === "payment_webhook_events" && q.op === "insert") {
            return { data: { id: "evt-row-1" } };
        }
        if (q.table === "payment_webhook_events" && q.op === "select") {
            return { data: { id: "evt-row-1", processed_at: state.webhookProcessedAt ?? null, processing_attempts: 0 } };
        }
        if (q.table === "payment_webhook_events") return { data: null };

        if (q.table === "payment_orders" && q.op === "select") {
            return {
                data: {
                    id: "order-uuid-1",
                    user_id: "rider-1",
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
        if (q.table === "payment_orders") return { data: null };

        if (q.table === "payment_transactions" && q.op === "insert") {
            return { data: { id: "txn-1" } };
        }
        if (q.table === "v_invoice_balances") {
            return { data: { balance_amount: 2500, is_paid: false } };
        }
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
});

describe("handleWebhook — signature verification", () => {
    it("rejects a forged signature", async () => {
        const body = JSON.stringify(capturedEvent());
        await expect(
            handleWebhook(Buffer.from(body), "deadbeef", "evt_forged"),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("rejects a body signed with the WRONG secret", async () => {
        const body = JSON.stringify(capturedEvent());
        await expect(
            handleWebhook(Buffer.from(body), sign(body, "not-our-secret"), "evt_1"),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("rejects a tampered body whose signature was valid for the ORIGINAL bytes", async () => {
        const original = JSON.stringify(capturedEvent());
        const signature = sign(original);
        // Attacker inflates the amount after signing.
        const tampered = JSON.stringify(capturedEvent({ amount: 1 }));

        await expect(
            handleWebhook(Buffer.from(tampered), signature, "evt_1"),
        ).rejects.toThrow(/signature verification failed/i);
    });

    it("PERSISTS the forgery attempt so reconciliation can see it", async () => {
        const body = JSON.stringify(capturedEvent());
        await expect(handleWebhook(Buffer.from(body), "bad", "evt_forged")).rejects.toThrow();

        const inserted = fake.on("payment_webhook_events", "insert")[0];
        expect(inserted).toBeDefined();
        expect(written(inserted, "is_signature_valid")).toBe(false);
        expect(written(inserted, "gateway_event_id")).toBe("invalid:evt_forged");
    });

    it("never dispatches a forged event to the payment path", async () => {
        const body = JSON.stringify(capturedEvent());
        await expect(handleWebhook(Buffer.from(body), "bad", "evt_forged")).rejects.toThrow();

        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
    });
});

describe("handleWebhook — event identity", () => {
    it("requires an event id rather than inventing one", async () => {
        // The fallback used to be randomUUID(), which is unique per call and
        // therefore the opposite of an idempotency key: a redelivery would
        // insert a second row and re-dispatch.
        const body = JSON.stringify({ event: "payment.captured", payload: {} });
        await expect(
            handleWebhook(Buffer.from(body), sign(body), undefined),
        ).rejects.toThrow(/event id/i);
    });

    it("prefers the x-razorpay-event-id header over the body id", async () => {
        const body = JSON.stringify({ ...capturedEvent(), id: "evt_from_body" });
        await handleWebhook(Buffer.from(body), sign(body), "evt_from_header");

        const inserted = fake.on("payment_webhook_events", "insert")[0];
        expect(written(inserted, "gateway_event_id")).toBe("evt_from_header");
    });

    it("falls back to the body id when the header is absent", async () => {
        const body = JSON.stringify({ ...capturedEvent(), id: "evt_from_body" });
        await handleWebhook(Buffer.from(body), sign(body), undefined);

        const inserted = fake.on("payment_webhook_events", "insert")[0];
        expect(written(inserted, "gateway_event_id")).toBe("evt_from_body");
    });

    it("records is_signature_valid on a genuine event", async () => {
        // Regression guard for the defect that made every webhook 500:
        // the column is NOT NULL with no default and was omitted under an
        // `as never` cast.
        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        const inserted = fake.on("payment_webhook_events", "insert")[0];
        expect(written(inserted, "is_signature_valid")).toBe(true);
    });
});

describe("handleWebhook — idempotency", () => {
    it("is a no-op when the same event was already processed", async () => {
        handler = (q) => {
            if (q.table === "payment_webhook_events" && q.op === "insert") {
                return { error: { code: "23505" } };
            }
            if (q.table === "payment_webhook_events" && q.op === "select") {
                return { data: { id: "evt-row-1", processed_at: "2026-08-22T10:00:00Z" } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_dup");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
    });

    it("REPROCESSES an event whose earlier dispatch never finished", async () => {
        // "Seen" is not "processed". Short-circuiting on the unique-violation
        // alone stranded payments that were captured and never allocated.
        handler = (q) => {
            if (q.table === "payment_webhook_events" && q.op === "insert") {
                return { error: { code: "23505" } };
            }
            if (q.table === "payment_webhook_events" && q.op === "select") {
                return { data: { id: "evt-row-1", processed_at: null, processing_attempts: 1 } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_retry");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(1);
    });

    it("does not double-apply when the transaction already exists", async () => {
        handler = (q) => {
            if (q.table === "payment_transactions" && q.op === "insert") {
                // The unique constraint on gateway_payment_id — the
                // system-wide idempotency anchor.
                return { error: { code: "23505" } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        expect(fake.on("payment_allocations", "insert")).toHaveLength(0);
    });

    it("marks the event processed only after dispatch succeeds", async () => {
        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        const updates = fake.on("payment_webhook_events", "update");
        const completion = updates.find((u) => u.payload?.processed_at);
        expect(completion).toBeDefined();
    });

    it("leaves processed_at null when dispatch throws, so Razorpay redelivers", async () => {
        handler = (q) => {
            if (q.table === "payment_transactions" && q.op === "insert") {
                return { error: { code: "XX000", message: "boom" } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await expect(handleWebhook(Buffer.from(body), sign(body), "evt_1")).rejects.toBeTruthy();

        const updates = fake.on("payment_webhook_events", "update");
        expect(updates.some((u) => u.payload?.processed_at)).toBe(false);
        expect(updates.some((u) => u.payload?.processing_error)).toBe(true);
    });
});

describe("handleWebhook — unknown orders and events", () => {
    it("ignores a capture for an order we have never issued", async () => {
        handler = (q) => {
            if (q.table === "payment_orders") return { data: null };
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
    });

    it("accepts an event type it does not handle without failing the delivery", async () => {
        const body = JSON.stringify({ event: "payment.dispute.created", payload: {} });
        await expect(handleWebhook(Buffer.from(body), sign(body), "evt_1")).resolves.toBeUndefined();
    });

    it("treats order.paid as a capture", async () => {
        const body = JSON.stringify({ ...capturedEvent(), event: "order.paid" });
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(1);
    });

    it("does not capture on payment.authorized", async () => {
        const body = JSON.stringify({ ...capturedEvent(), event: "payment.authorized" });
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        expect(fake.on("payment_transactions", "insert")).toHaveLength(0);
        // But it does mark the order as attempted so the sweep leaves it be.
        const updates = fake.on("payment_orders", "update");
        expect(updates.some((u) => u.payload?.status === "attempted")).toBe(true);
    });

    it("records a declined attempt on payment.failed", async () => {
        const body = JSON.stringify({
            event: "payment.failed",
            payload: {
                payment: {
                    entity: {
                        id: "pay_declined01",
                        order_id: "order_real01",
                        amount: 250000,
                        method: "card",
                        error_code: "BAD_REQUEST_ERROR",
                        error_description: "Card declined by issuer.",
                    },
                },
            },
        });
        await handleWebhook(Buffer.from(body), sign(body), "evt_fail");

        const txn = fake.on("payment_transactions", "insert")[0];
        expect(written(txn, "status")).toBe("failed");
        expect(written(txn, "captured_at")).toBeNull();
        expect(written(txn, "failure_reason")).toBe("Card declined by issuer.");
    });
});

describe("handleWebhook — settlement gating", () => {
    it("does NOT advance the booking when the invoice is only part-paid", async () => {
        handler = (q) => {
            if (q.table === "v_invoice_balances") {
                // Owed 2500; this capture covers 2500, but another allocation
                // path has left a balance. is_paid is the authority.
                return { data: { balance_amount: 2500, is_paid: false } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        const bookingUpdates = fake.on("bookings", "update");
        expect(bookingUpdates.some((u) => u.payload?.status === "confirmed")).toBe(false);
    });

    it("advances the booking once the invoice IS settled", async () => {
        handler = (q) => {
            if (q.table === "v_invoice_balances") {
                return { data: { balance_amount: 2500, is_paid: true } };
            }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        const bookingUpdates = fake.on("bookings", "update");
        expect(bookingUpdates.some((u) => u.payload?.status === "confirmed")).toBe(true);
    });

    it("holds the deposit only on a settled initial invoice", async () => {
        handler = (q) => {
            if (q.table === "v_invoice_balances") return { data: { balance_amount: 2500, is_paid: true } };
        if (q.table === "subscriptions") {
            return {
                data: {
                    id: "sub-1", booking_id: "booking-1", status: "active",
                    duration_days_snapshot: 7, plan_price_snapshot: 1800,
                },
            };
        }
            return baseHandler()(q);
        };

        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_1");

        const depositUpdates = fake.on("deposits", "update");
        expect(depositUpdates.some((u) => u.payload?.status === "held")).toBe(true);
    });
});

describe("handleWebhook — activation is keyed on the PERIOD, not the label", () => {
    // generate_period_invoice() writes purpose='subscription_period' for EVERY
    // invoice, the opening one included, and chk_invoices_purpose_period forbids
    // relabelling it. So the production shape of a first payment is
    // purpose='subscription_period' + sequence_number=1 — and while the code
    // branched on purpose alone, that shape confirmed nothing. Riders paid in
    // full and their booking stayed `pending_payment`.
    const productionShape = (sequenceNumber: number): QueryHandler => (q) => {
        if (q.table === "payment_orders" && q.op === "select") {
            return {
                data: {
                    id: "order-uuid-1", user_id: "rider-1", amount: 2500, currency: "INR",
                    invoice_id: "invoice-1",
                    invoices: {
                        purpose: "subscription_period",
                        subscription_id: "sub-1",
                        subscription_period_id: "period-1",
                        total_amount: 2500,
                    },
                },
            };
        }
        if (q.table === "subscription_periods" && q.op === "select") {
            // Two different reads hit this table, told apart by their filters.
            const byId = q.filters.some((f) => f[0] === "eq" && f[1] === "id");
            // getPeriodSequenceNumber — the one under test.
            if (byId) return { data: { sequence_number: sequenceNumber } };
            // applyRenewalSuccess's current-period lookup. Null makes it
            // early-return, which keeps this test focused on the branch
            // decision rather than on renewal scheduling.
            return { data: null };
        }
        if (q.table === "v_invoice_balances") return { data: { balance_amount: 2500, is_paid: true } };
        return baseHandler()(q);
    };

    it("CONFIRMS the booking when period 1 is paid, despite the label", async () => {
        handler = productionShape(1);
        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_p1");

        const bookingUpdates = fake.on("bookings", "update");
        expect(bookingUpdates.some((u) => u.payload?.status === "confirmed")).toBe(true);
    });

    it("holds the deposit when period 1 is paid", async () => {
        handler = productionShape(1);
        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_p1b");

        const depositUpdates = fake.on("deposits", "update");
        expect(depositUpdates.some((u) => u.payload?.status === "held")).toBe(true);
    });

    it("does NOT re-confirm the booking on a later period — that is a renewal", async () => {
        handler = productionShape(3);
        const body = JSON.stringify(capturedEvent());
        await handleWebhook(Buffer.from(body), sign(body), "evt_p3");

        // Only the confirmation is asserted here. What a renewal goes on to
        // do with periods is applyRenewalSuccess's business and is covered by
        // its own tests; pinning it here would mean maintaining a full
        // period/subscription fixture for an assertion this test is not about.
        const bookingUpdates = fake.on("bookings", "update");
        expect(bookingUpdates.some((u) => u.payload?.status === "confirmed")).toBe(false);
        expect(fake.on("deposits", "update")).toHaveLength(0);
    });
});

describe("handleWebhook — currency", () => {
    it("refuses a capture in a currency the order was not denominated in", async () => {
        const body = JSON.stringify(capturedEvent({ currency: "USD" }));
        await expect(
            handleWebhook(Buffer.from(body), sign(body), "evt_1"),
        ).rejects.toThrow(/currency/i);
    });
});
