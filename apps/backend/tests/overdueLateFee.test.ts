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
    update = (...a: unknown[]) => this.record("update", a);
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
    syncOverdueLateFeeInvoiceForUser,
} = await import("../src/modules/rentals/overdueLateFee");

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PERIOD_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
    queues = {};
    stubsByTable = {};
    vi.useFakeTimers();
    // "Today" is 2026-08-25 IST against a 2026-08-23 due_on: the 24th was
    // lost, the 25th is bought by the renewal itself, so exactly ONE day is
    // chargeable. See computeLateRenewalFee for why today never counts.
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
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-23" }, error: null });
        // lateFeeReferenceDate(subscriptionId, null, dueOn): subscriptionPeriodId is null, so it
        // returns invoiceDueOn immediately and never touches subscription_periods again here.
        queue("pricing_rules", { data: null, error: null }); // no per-subscription override
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null }); // global rule

        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toEqual({ isLate: true, daysLate: 1, feePerDay: 450, lateFee: 450, dueOn: "2026-08-23" });
    });
});

/**
 * The boundary that separates the renewal fee from the return fee. Renewing
 * pays for today (applyRenewalSuccess re-anchors starts_on to today), so today
 * is never also charged as a penalty; returning loses today, and
 * computeLateReturnPenalty counts it — see rentalReturnPolicy.test.ts, which
 * still expects 2 days where this expects 1.
 */
describe("previewOverdueLateFee — today is never charged", () => {
    it("charges nothing on the first day past the due date", async () => {
        // Due on the 24th, today the 25th: the 25th is the first unpaid day
        // AND the day the renewal would start. Nothing has been lost yet.
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-24" }, error: null });

        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toEqual({ isLate: false, daysLate: 0, feePerDay: 0, lateFee: 0, dueOn: "2026-08-24" });
    });

    it("charges one day on the second day past the due date", async () => {
        // Due on the 23rd, today the 25th: the 24th was lost, the 25th is bought.
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-23" }, error: null });
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });

        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toMatchObject({ isLate: true, daysLate: 1, lateFee: 450 });
    });

    it("grows by one whole day thereafter", async () => {
        vi.setSystemTime(new Date("2026-08-27T10:00:00+05:30"));
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-23" }, error: null });
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });

        // 24th, 25th, 26th lost; the 27th is bought by the renewal.
        const preview = await previewOverdueLateFee(SUBSCRIPTION_ID);
        expect(preview).toMatchObject({ isLate: true, daysLate: 3, lateFee: 1350 });
    });
});

describe("isOverdueLateFeeSettled", () => {
    it("is settled when the current period isn't overdue", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(true);
    });

    it("is NOT settled when overdue and no adhoc invoice exists yet", async () => {
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: null, error: null }); // no existing adhoc invoice

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(false);
    });

    it("is NOT settled when an adhoc invoice exists but is unpaid", async () => {
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: false }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(false);
    });

    it("IS settled once the adhoc invoice is paid — never asks again", async () => {
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: true }, error: null });

        expect(await isOverdueLateFeeSettled(SUBSCRIPTION_ID)).toBe(true);
    });
});

describe("ensureOverdueLateFeeInvoice", () => {
    it("creates a fresh adhoc invoice when none exists for this overdue cycle", async () => {
        queuePeriod("2026-08-23");
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
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "existing-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: false }, error: null }); // isInvoicePaid
        queue("v_invoice_balances", { data: { allocated_amount: 0, is_paid: false }, error: null }); // reprice

        const result = await ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID);
        expect(result).toEqual({ invoiceId: "existing-invoice-id", amount: 450, isPaid: false });
        // No second `invoices` insert was ever queued/consumed — reusing the
        // one from the lookup is the only call that hit the invoices table.
        // Still one day late at the same rate, so the re-price is a no-op too.
        expect(stubsByTable.invoices).toHaveLength(1);
        expect(stubsByTable.invoices[0].calls.some(([name]) => name === "update")).toBe(false);
    });

    it("re-prices a stale invoice to TODAY's fee instead of handing back day one's", async () => {
        // Two days overdue now; the open invoice was minted on day one at 450.
        vi.setSystemTime(new Date("2026-08-26T10:00:00+05:30"));
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "existing-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: false }, error: null }); // isInvoicePaid
        queue("v_invoice_balances", { data: { allocated_amount: 0, is_paid: false }, error: null }); // reprice
        queue("invoices", { data: null, error: null }); // the invoice update
        queue("invoice_items", { data: null, error: null }); // the line-item update

        const result = await ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID);
        expect(result).toEqual({ invoiceId: "existing-invoice-id", amount: 900, isPaid: false });

        const invoiceUpdate = stubsByTable.invoices[1].calls.find(([name]) => name === "update");
        expect(invoiceUpdate?.[1][0]).toEqual({ subtotal_amount: 900, total_amount: 900 });

        // The day count lives IN the description, so it has to be rewritten
        // with the amount or the bill contradicts itself.
        const itemUpdate = stubsByTable.invoice_items[0].calls.find(([name]) => name === "update");
        expect(itemUpdate?.[1][0]).toMatchObject({
            description: "Overdue plan renewal — late fee (2 days @ ₹450/day)",
            unit_amount: 900,
            amount: 900,
        });
    });

    it("leaves a PAID invoice alone however many days pass — the cycle is settled", async () => {
        vi.setSystemTime(new Date("2026-08-30T10:00:00+05:30"));
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "existing-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { is_paid: true }, error: null });

        const result = await ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID);
        expect(result).toEqual({ invoiceId: "existing-invoice-id", amount: 450, isPaid: true });
        expect(stubsByTable.invoices[0].calls.some(([name]) => name === "update")).toBe(false);
    });

    it("throws rather than charging again once nothing is actually owed", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });

        await expect(ensureOverdueLateFeeInvoice(SUBSCRIPTION_ID, USER_ID)).rejects.toThrow(
            "has no late fee due",
        );
    });
});

/**
 * The READ path — what the rider's own Billing screen goes through. Without
 * it the bill quoted whatever the fee was on the day the invoice was minted
 * until the rider happened to open the Return sheet, so Billing and Home
 * stated two different day counts and two different rupee amounts for one
 * debt.
 */
describe("syncOverdueLateFeeInvoiceForUser", () => {
    it("re-prices the rider's open invoice to today's fee", async () => {
        vi.setSystemTime(new Date("2026-08-26T10:00:00+05:30"));
        queue("rentals", { data: { subscription_id: SUBSCRIPTION_ID }, error: null });
        queuePeriod("2026-08-23");
        queue("pricing_rules", { data: null, error: null });
        queue("pricing_rules", { data: { amount: 450, is_active: true }, error: null });
        queue("invoices", { data: { id: "existing-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 0, is_paid: false }, error: null });
        queue("invoices", { data: null, error: null });
        queue("invoice_items", { data: null, error: null });

        await syncOverdueLateFeeInvoiceForUser(USER_ID);

        expect(stubsByTable.invoices[1].calls.find(([name]) => name === "update")?.[1][0])
            .toEqual({ subtotal_amount: 900, total_amount: 900 });
    });

    it("does nothing at all for a rider with no active rental", async () => {
        queue("rentals", { data: null, error: null });

        await syncOverdueLateFeeInvoiceForUser(USER_ID);

        expect(stubsByTable.invoices).toBeUndefined();
        expect(stubsByTable.subscription_periods).toBeUndefined();
    });

    it("writes nothing when the rider is not overdue and has no stale invoice", async () => {
        queue("rentals", { data: { subscription_id: SUBSCRIPTION_ID }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-26" }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, created_at: "2026-08-18T00:00:00.000Z" }, error: null });
        queue("invoices", { data: null, error: null });

        await syncOverdueLateFeeInvoiceForUser(USER_ID);

        expect(stubsByTable.invoices[0].calls.some(([name]) => name === "update")).toBe(false);
    });

    /**
     * The counterpart to lateFeeAlreadyCharged netting a PAID adhoc off a
     * renewal: once the renewal has collected the fee, the adhoc invoice
     * raised earlier is a bill for a debt that no longer exists.
     */
    it("voids a stale open invoice once the rider is no longer overdue", async () => {
        queue("rentals", { data: { subscription_id: SUBSCRIPTION_ID }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-30" }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, created_at: "2026-08-25T00:00:00.000Z" }, error: null });
        queue("invoices", { data: { id: "stale-invoice-id", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 0 }, error: null });
        queue("invoices", { data: null, error: null }); // the void update

        await syncOverdueLateFeeInvoiceForUser(USER_ID);

        const update = stubsByTable.invoices[1].calls.find(([name]) => name === "update");
        expect(update?.[1][0]).toMatchObject({ status: "void" });
    });

    it("never voids an invoice money has already been allocated to", async () => {
        queue("rentals", { data: { subscription_id: SUBSCRIPTION_ID }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, due_on: "2026-08-30" }, error: null });
        queue("subscription_periods", { data: { id: PERIOD_ID, created_at: "2026-08-25T00:00:00.000Z" }, error: null });
        queue("invoices", { data: { id: "part-paid-invoice", total_amount: 450 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 200 }, error: null });

        await syncOverdueLateFeeInvoiceForUser(USER_ID);

        expect(stubsByTable.invoices[0].calls.some(([name]) => name === "update")).toBe(false);
    });
});
