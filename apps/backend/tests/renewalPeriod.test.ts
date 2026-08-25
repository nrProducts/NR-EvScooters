import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type QueryHandler, type QueryRecord } from "./helpers/fakeSupabase";

/**
 * WHICH PERIOD A RENEWAL BILLS, and when a scheduled one counts as renewed.
 *
 * The bug pinned down here: "Renew Plan" asked for the CURRENT period's
 * invoice. Every period is paid for in advance, so the current one was always
 * already settled — the rider was shown their own checkout receipt (deposit,
 * welcome discount, "Renewal amount ₹0") and Confirm & Pay could only answer
 * "this invoice has already been paid". The first renewal was unreachable.
 *
 * generatePeriodInvoice resolves that now (resolveInvoiceablePeriod →
 * advanceToNextPeriod). These run against the fake PostgREST builder rather
 * than a database, because what is asserted is the DECISION — which period is
 * invoiced, what dates a new one is created with — not the SQL.
 */

let handler: QueryHandler = () => ({ data: null });
let fake = createFakeSupabase((q) => handler(q), (fn, args) => rpcHandler(fn, args));
const fakeRef = { current: fake as unknown as Record<string, unknown> };
let rpcHandler: (fn: string, args: unknown) => { data?: unknown; error?: unknown } =
    () => ({ data: "invoice-1" });

vi.mock("../src/config/supabase", () => ({
    get supabaseAdmin() {
        return fakeRef.current;
    },
}));

const { generatePeriodInvoice } = await import("../src/modules/billing/billing.service");
const { paidPeriodIds } = await import("../src/modules/payments/renewalPeriod");

const SUB = "sub-1";
const TODAY = "2026-08-25";

/** businessToday() reads the clock, so the clock is what moves in these tests. */
function atNoonIst(day: string): Date {
    return new Date(`${day}T06:30:00Z`); // 12:00 IST
}

interface World {
    current: {
        id: string; sequence_number: number;
        starts_on: string; ends_on: string; due_on: string;
    };
    /** Whether the current period's own invoice is settled. */
    currentPaid: boolean;
    /** A next period left behind by an earlier preview, if any. */
    next?: { id: string; sequence_number: number };
    durationDays?: number;
}

function build(world: World): { inserts: QueryRecord[]; invoicedPeriods: unknown[] } {
    const inserts: QueryRecord[] = [];
    const invoicedPeriods: unknown[] = [];

    rpcHandler = (fn, args) => {
        if (fn === "generate_period_invoice") {
            invoicedPeriods.push((args as { p_subscription_period_id: string }).p_subscription_period_id);
            return { data: "invoice-generated" };
        }
        return { data: null };
    };

    handler = (q) => {
        if (q.table === "v_subscription_current_period") {
            return { data: { subscription_period_id: world.current.id } };
        }

        if (q.table === "subscription_periods" && q.op === "insert") {
            inserts.push(q);
            return { data: { ...(q.payload as object), id: "period-new" } };
        }

        if (q.table === "subscription_periods") {
            const sequence = q.filters.find((f) => f[1] === "sequence_number")?.[2];
            if (sequence === world.current.sequence_number + 1) {
                return { data: world.next ? { id: world.next.id } : null };
            }
            return { data: world.current };
        }

        // resolveInvoiceablePeriod: the current period's invoice, then whether
        // it is settled.
        if (q.table === "invoices") {
            return { data: { id: `invoice-${world.current.id}` } };
        }
        if (q.table === "v_invoice_balances") {
            return { data: { is_paid: world.currentPaid } };
        }

        if (q.table === "subscriptions") {
            return {
                data: {
                    duration_days_snapshot: world.durationDays ?? 7,
                    plan_price_snapshot: 1800,
                },
            };
        }

        return { data: null };
    };

    return { inserts, invoicedPeriods };
}

beforeEach(() => {
    fake = createFakeSupabase((q) => handler(q), (fn, args) => rpcHandler(fn, args));
    fakeRef.current = fake as unknown as Record<string, unknown>;
    vi.useRealTimers();
});

const PERIOD_1 = {
    id: "period-1", sequence_number: 1,
    starts_on: "2026-08-15", ends_on: "2026-08-22", due_on: "2026-08-22",
};

describe("generatePeriodInvoice", () => {
    it("bills the NEXT period, not the settled current one", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst(TODAY));
        const { inserts, invoicedPeriods } = build({ current: PERIOD_1, currentPaid: true });

        await generatePeriodInvoice(SUB);

        expect(inserts).toHaveLength(1);
        expect(inserts[0]!.payload).toMatchObject({ sequence_number: 2, status: "scheduled" });
        // Not period-1's already-paid invoice, which is what the rider was
        // being shown as their "renewal".
        expect(invoicedPeriods).toEqual(["period-new"]);
    });

    it("creates the next period as `scheduled`, never `current`", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst(TODAY));
        const { inserts } = build({ current: PERIOD_1, currentPaid: true });

        await generatePeriodInvoice(SUB);

        // This runs from a PREVIEW. A rider who opens Review & Renew and walks
        // away must not have their plan advanced with nothing paid; only a
        // captured payment promotes it.
        expect(inserts[0]!.payload).toMatchObject({ status: "scheduled" });
    });

    it("dates a LATE renewal from today, not backdated to the lapsed period", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst(TODAY));
        const { inserts } = build({ current: PERIOD_1, currentPaid: true });

        await generatePeriodInvoice(SUB);

        // Backdating to 23 Aug would sell three days that have already gone
        // by, and chk_invoices_due would reject an invoice issued today whose
        // due date is in the past.
        expect(inserts[0]!.payload).toMatchObject({
            starts_on: "2026-08-25",
            ends_on: "2026-08-31",
            due_on: "2026-08-31",
        });
    });

    it("dates an ON-TIME renewal from the day after the current period ends", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst("2026-08-20"));
        const { inserts } = build({ current: PERIOD_1, currentPaid: true });

        await generatePeriodInvoice(SUB);

        expect(inserts[0]!.payload).toMatchObject({
            starts_on: "2026-08-23",
            ends_on: "2026-08-29",
        });
    });

    it("reuses an existing next period instead of minting a second one", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst(TODAY));
        const { inserts, invoicedPeriods } = build({
            current: PERIOD_1,
            currentPaid: true,
            next: { id: "period-2", sequence_number: 2 },
        });

        await generatePeriodInvoice(SUB);

        // A double-tapped Renew must land on the same invoice, and therefore
        // the same payment order.
        expect(inserts).toHaveLength(0);
        expect(invoicedPeriods).toEqual(["period-2"]);
    });

    it("bills the CURRENT period when its own bill was never settled", async () => {
        vi.useFakeTimers().setSystemTime(atNoonIst(TODAY));
        const { inserts, invoicedPeriods } = build({
            current: { ...PERIOD_1, id: "period-3", sequence_number: 3 },
            currentPaid: false,
        });

        await generatePeriodInvoice(SUB);

        // Nothing to advance to while a cycle is still owed for.
        expect(inserts).toHaveLength(0);
        expect(invoicedPeriods).toEqual(["period-3"]);
    });
});

describe("paidPeriodIds", () => {
    it("is empty when nothing was asked for, without querying", async () => {
        build({ current: PERIOD_1, currentPaid: true });

        expect((await paidPeriodIds([])).size).toBe(0);
        expect(fake.queries).toHaveLength(0);
    });

    it("does not count a period whose invoice is unpaid", async () => {
        handler = (q) => {
            if (q.table === "invoices") {
                return { data: [{ id: "invoice-1", subscription_period_id: "period-2" }] };
            }
            if (q.table === "v_invoice_balances") {
                return { data: [{ invoice_id: "invoice-1", is_paid: false }] };
            }
            return { data: null };
        };

        // An unpaid `scheduled` row is a renewal the rider opened and walked
        // away from. Counting it would tell them a renewal was booked and let
        // the overdue sweep promote the period for free.
        expect((await paidPeriodIds(["period-2"])).has("period-2")).toBe(false);
    });

    it("counts a period whose invoice is settled", async () => {
        handler = (q) => {
            if (q.table === "invoices") {
                return { data: [{ id: "invoice-1", subscription_period_id: "period-2" }] };
            }
            if (q.table === "v_invoice_balances") {
                return { data: [{ invoice_id: "invoice-1", is_paid: true }] };
            }
            return { data: null };
        };

        expect((await paidPeriodIds(["period-2"])).has("period-2")).toBe(true);
    });
});
