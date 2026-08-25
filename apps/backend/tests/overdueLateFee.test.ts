import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Per-table, per-call FIFO queue: each call to supabaseAdmin.from(table)
 * pops the next queued result for that table (or falls back to an empty
 * result once the queue drains). Needed because a single test exercises the
 * SAME table more than once with DIFFERENT expected results — e.g.
 * ensureOverdueLateFeeInvoice selects from `invoices` to look for an
 * existing one, then inserts into `invoices` to create a fresh one.
 */
type Result = { data: unknown; error: unknown };

class TableStub {
    calls: [string, unknown[]][] = [];
    constructor(private result: Result) {}
    private record(name: string, args: unknown[]) {
        this.calls.push([name, args]);
        return this;
    }
    select = (...a: unknown[]) => this.record("select", a);
    insert = (...a: unknown[]) => this.record("insert", a);
    eq = (...a: unknown[]) => this.record("eq", a);
    neq = (...a: unknown[]) => this.record("neq", a);
    gte = (...a: unknown[]) => this.record("gte", a);
    order = (...a: unknown[]) => this.record("order", a);
    limit = (...a: unknown[]) => this.record("limit", a);
    maybeSingle = (...a: unknown[]) => this.record("maybeSingle", a);
    single = (...a: unknown[]) => this.record("single", a);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;
let stubsByTable: Record<string, TableStub[]>;

function queue(table: string, result: Result) {
    (queues[table] ??= []).push(result);
}

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => {
            const result = queues[table]?.shift() ?? { data: null, error: null };
            const stub = new TableStub(result);
            (stubsByTable[table] ??= []).push(stub);
            return stub;
        },
    },
}));

const {
    previewOverdueLateFee, isOverdueLateFeeSettled, ensureOverdueLateFeeInvoice,
} = await import("../src/modules/rentals/overdueLateFee");

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PERIOD_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
    queues = {};
    stubsByTable = {};
    vi.useFakeTimers();
    // "Today" is 2026-08-25 IST — one whole day past a 2026-08-24 due_on.
    vi.setSystemTime(new Date("2026-08-25T10:00:00+05:30"));
});

afterEach(() => {
    vi.useRealTimers();
});

/** subscription_periods is read twice: previewOverdueLateFee's due_on lookup, then currentPeriodWindow's id/created_at lookup. Both share one row shape. */
function queuePeriod(dueOn: string, createdAt = "2026-08-18T00:00:00.000Z", times = 2) {
    for (let i = 0; i < times; i++) {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: dueOn, created_at: createdAt }, error: null });
    }
}

describe("previewOverdueLateFee", () => {
    it("reports not late when the current period isn't overdue yet", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });

        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toEqual({ isLate: false, daysLate: 0, feePerDay: 0, lateFee: 0, dueOn: "2026-08-26" });
    });

    it("computes the fee from the global pricing_rules rate once overdue", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-24" }, error: null });
        // lateFeeReferenceDate(subscriptionId, null, dueOn): subscriptionPeriodId is null, so it
        // returns invoiceDueOn immediately and never touches subscription_periods again here.
        queue("pricing_rules", { data: null, error: null }); // no per-subscription override
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null }); // global rule

        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toEqual({ isLate: true, daysLate: 1, feePerDay: 450, lateFee: 450, dueOn: "2026-08-24" });
    });
});

describe("isOverdueLateFeeSettled", () => {
    it("is settled when the current period isn't overdue", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(true);
    });

    it("is NOT settled when overdue and no adhoc invoice exists yet", async () => {
        queuePeriod("2026-08-24");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: null, error: null }); // no existing adhoc invoice

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(false);
    });

    it("is NOT settled when an adhoc invoice exists but is unpaid", async () => {
        queuePeriod("2026-08-24");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: false }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(false);
    });

    it("IS settled once the adhoc invoice is paid — never asks again", async () => {
        queuePeriod("2026-08-24");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: true }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(true);
    });
});

describe("ensureOverdueLateFeeInvoice", () => {
    it("creates a fresh adhoc invoice when none exists for this overdue cycle", async () => {
        queuePeriod("2026-08-24");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: null, error: null }); // no existing invoice
        queue("invoice_series", { data: { code: "SNG-FY2627" }, error: null });
        queue("invoices", { data: { id: "new-invoice-id" }, error: null }); // the insert's .select().single()
        queue("invoice_items", { data: null, error: null });

        const result = await ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID);
        expect(result).toEqual({ invoiceId: "new-invoice-id", amount: 450, isPaid: false });

        const insertCall = stubsByTable.invoices[1].calls.find(([name]) => name === "insert");
        expect(insertCall?.[1][0]).toMatchObject({
            user_id: USER_ID,
            subscription_id: SUBSCRIPTION_ID,
            purpose: "adhoc",
            total_amount: 450,
            // Looked up dynamically, not the wrong hardcoded "SNG" literal —
            // trg_allocate_invoice_number matches invoice_series.code EXACTLY
            // and the live series is fiscal-year-suffixed ("SNG-FY2627").
            invoice_series_code: "SNG-FY2627",
        });
    });

    it("reuses the SAME invoice on a second call rather than creating a duplicate", async () => {
        queuePeriod("2026-08-24");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "existing-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: false }, error: null });

        const result = await ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID);
        expect(result).toEqual({ invoiceId: "existing-invoice-id", amount: 450, isPaid: false });
        // No second `invoices` insert was ever queued/consumed — reusing the
        // one from the lookup is the only call that hit the invoices table.
        expect(stubsByTable.invoices).toHaveLength(1);
    });

    it("throws rather than charging again once nothing is actually owed", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });

        await expect(ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID)).rejects.toThrow(
            "has no late fee due",
        );
    });
});
