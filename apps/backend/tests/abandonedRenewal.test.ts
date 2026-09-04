import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The phantom renewal bill an abandoned "Review & Renew" leaves behind, and
 * requestReturn voiding it — see src/modules/rentals/abandonedRenewal.ts.
 *
 * Same per-table FIFO queue as tests/overdueLateFee.test.ts: one call exercises
 * `invoices` twice (find, then void), and `subscription_periods` before that.
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
    update = (...a: unknown[]) => this.record("update", a);
    eq = (...a: unknown[]) => this.record("eq", a);
    neq = (...a: unknown[]) => this.record("neq", a);
    in = (...a: unknown[]) => this.record("in", a);
    gt = (...a: unknown[]) => this.record("gt", a);
    order = (...a: unknown[]) => this.record("order", a);
    limit = (...a: unknown[]) => this.record("limit", a);
    maybeSingle = (...a: unknown[]) => this.record("maybeSingle", a);
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

const { voidAbandonedRenewalInvoice, hasOpenReturn, hasOpenReturnForUser } =
    await import("../src/modules/rentals/abandonedRenewal");

const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PERIOD_ID = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
    queues = {};
    stubsByTable = {};
});

describe("voidAbandonedRenewalInvoice", () => {
    it("voids the unpaid renewal invoice left on a scheduled period", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 1800 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 0 }, error: null });
        queue("invoices", { data: null, error: null }); // the void update
        queue("subscription_adjustments", { data: null, error: null });

        expect(await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID))
            .toEqual({ invoiceId: "inv-1", amount: 1800 });

        // chk_invoices_void requires voided_at AND void_reason whenever status
        // is 'void' — a bare status flip fails the constraint outright.
        const update = stubsByTable.invoices[1].calls.find(([name]) => name === "update")?.[1][0] as
            Record<string, unknown>;
        expect(update.status).toBe("void");
        expect(update.voided_at).toBeTruthy();
        expect(update.void_reason).toBeTruthy();
    });

    /**
     * generate_period_invoice() only writes lines for adjustments whose status
     * is 'pending', and stamps each 'invoiced' as it goes. Leaving them
     * 'invoiced' against a VOID invoice means a later re-invoice of the same
     * period (return rejected, rider renews after all) silently drops the
     * discount or the fee that belonged on it.
     */
    it("returns the period's adjustments to 'pending' so a re-invoice still carries them", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 1800 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 0 }, error: null });
        queue("invoices", { data: null, error: null });
        queue("subscription_adjustments", { data: null, error: null });

        await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID);

        const adj = stubsByTable.subscription_adjustments[0];
        expect((adj.calls.find(([name]) => name === "update")?.[1][0] as Record<string, unknown>).status)
            .toBe("pending");
        // Only this period's, and only the ones the void just orphaned.
        expect(adj.calls).toContainEqual(["eq", ["subscription_period_id", PERIOD_ID]]);
        expect(adj.calls).toContainEqual(["eq", ["status", "invoiced"]]);
    });

    it("NEVER voids an invoice money has already been allocated to", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID }, error: null });
        queue("invoices", { data: { id: "inv-1", total_amount: 1800 }, error: null });
        queue("v_invoice_balances", { data: { allocated_amount: 500 }, error: null });

        expect(await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID)).toBeNull();
        expect(stubsByTable.invoices).toHaveLength(1);
        expect(stubsByTable.invoices[0].calls.some(([name]) => name === "update")).toBe(false);
    });

    it("does nothing when there is no un-bought period", async () => {
        queue("subscription_periods", { data: null, error: null });

        expect(await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID)).toBeNull();
        expect(stubsByTable.invoices).toBeUndefined();
    });

    /**
     * The first cut of this looked at 'scheduled' only, and missed the case
     * that actually happens: the DEPLOYED payment-overdue-sweep promotes an
     * unpaid scheduled period to 'current' (its is_paid guard postdates the
     * deployed build), so an abandoned preview is usually sitting there as the
     * rider's 'current' period by the time they return. Rukesh Kumar's ₹1800
     * invoice SNG/2627/000050 was exactly this and would have survived.
     */
    it("covers a promoted period too — 'scheduled' alone missed the real case", async () => {
        queue("subscription_periods", { data: null, error: null });
        await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID);

        expect(stubsByTable.subscription_periods[0].calls)
            .toContainEqual(["in", ["status", ["scheduled", "current"]]]);
    });

    /**
     * Period 1 is the opening invoice from checkout. If THAT is unpaid the
     * rider genuinely owes it, and voiding it would write off a real debt.
     * Every later period is billed in advance, so unpaid means never bought —
     * and the days actually ridden are charged by the overdue late fee.
     */
    it("never reaches the opening period, whose unpaid invoice is a real debt", async () => {
        queue("subscription_periods", { data: null, error: null });
        await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID);

        expect(stubsByTable.subscription_periods[0].calls)
            .toContainEqual(["gt", ["sequence_number", 1]]);
    });

    it("does nothing when the scheduled period was never invoiced", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID }, error: null });
        queue("invoices", { data: null, error: null });

        expect(await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID)).toBeNull();
    });

    it("is idempotent — an already-void invoice is filtered out, so a second call is a no-op", async () => {
        queue("subscription_periods", { data: { id: PERIOD_ID }, error: null });
        queue("invoices", { data: null, error: null }); // .neq('status','void') matched nothing

        expect(await voidAbandonedRenewalInvoice(SUBSCRIPTION_ID)).toBeNull();
        expect(stubsByTable.invoices[0].calls).toContainEqual(["neq", ["status", "void"]]);
    });
});

/**
 * 'requested' and 'inspected' are the open states. A 'rejected' return leaves
 * the rider on their plan exactly as before and they MUST be able to renew
 * again; an 'approved' one has already ended the rental.
 */
describe("hasOpenReturn", () => {
    it("is true while a return is requested or inspected", async () => {
        queue("rental_returns", { data: { id: "ret-1" }, error: null });
        expect(await hasOpenReturn(SUBSCRIPTION_ID)).toBe(true);
    });

    it("is false when nothing is open", async () => {
        queue("rental_returns", { data: null, error: null });
        expect(await hasOpenReturn(SUBSCRIPTION_ID)).toBe(false);
    });

    it("asks only for the open statuses — a rejected return must not lock renewal", async () => {
        queue("rental_returns", { data: null, error: null });
        await hasOpenReturn(SUBSCRIPTION_ID);

        expect(stubsByTable.rental_returns[0].calls)
            .toContainEqual(["in", ["status", ["requested", "inspected"]]]);
    });

    it("the per-user form is scoped to an ACTIVE rental", async () => {
        queue("rental_returns", { data: null, error: null });
        await hasOpenReturnForUser(USER_ID);

        const calls = stubsByTable.rental_returns[0].calls;
        expect(calls).toContainEqual(["eq", ["rentals.user_id", USER_ID]]);
        expect(calls).toContainEqual(["eq", ["rentals.status", "active"]]);
    });
});
