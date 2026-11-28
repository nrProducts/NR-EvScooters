import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin "Change billing cycle" — src/modules/billing-cycle.
 *
 * The rules and writes live in public.change_billing_cycle (one transaction);
 * these tests cover the TypeScript around it: request validation, booking →
 * subscription resolution, the exact RPC arguments, rule-error mapping to a
 * 422, and that the rider is notified only after a successful APPLY.
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
    maybeSingle = (...a: unknown[]) => this.record("maybeSingle", a);
    then(onFulfilled: (v: Result) => unknown) {
        return Promise.resolve(this.result).then(onFulfilled);
    }
}

let queues: Record<string, Result[]>;
let rpcCalls: [string, Record<string, unknown>][];
let rpcResult: Result;
const notifyUser = vi.fn();

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: {
        from: (table: string) => new TableStub(queues[table]?.shift() ?? { data: null, error: null }),
        rpc: (fn: string, args: Record<string, unknown>) => {
            rpcCalls.push([fn, args]);
            return Promise.resolve(rpcResult);
        },
    },
}));
vi.mock("../src/modules/notifications/notifications.service", () => ({ notifyUser }));
const recordOfflinePayment = vi.fn();
vi.mock("../src/modules/payments/payments.service", () => ({ recordOfflinePayment }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn() }));

const service = await import("../src/modules/billing-cycle/billing-cycle.service");
const { applyBillingCycleBody, previewBillingCycleBody, updateBillingCycleSettingsBody } =
    await import("../src/modules/billing-cycle/billing-cycle.validation");

const BOOKING_ID = "44444444-4444-4444-8444-444444444444";
const SUBSCRIPTION_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN = { id: "55555555-5555-4555-8555-555555555555", role: "admin" } as never;

const RESULT = {
    subscription_id: SUBSCRIPTION_ID,
    user_id: USER_ID,
    applied: true,
    old_due_on: "2026-11-13",
    old_cycle_time: "21:53",
    old_due_at: "2026-11-13T16:23:00+00:00",
    new_due_on: "2026-11-15",
    new_cycle_time: "20:00",
    new_due_at: "2026-11-15T14:30:00+00:00",
    extra_days: 2,
    max_extra_days: 7,
    status_before: "active",
    status_after: "active",
    periods: [],
    rental_id: "66666666-6666-4666-8666-666666666666",
    old_due_back_at: "2026-11-13T16:23:00+00:00",
    new_due_back_at: "2026-11-15T14:30:00+00:00",
    clears_recovery_flag: false,
    invoices_moved: 0,
    // Weekly ₹2,100 → ₹300/day. 13 Nov 9:53 PM → 15 Nov 8:00 PM: date +2 days
    // = ₹600; the time moves EARLIER, so no hour charge and no reduction.
    charge: {
        enabled: true, period_price: 2100, plan_days: 7, daily_rate: 300, hourly_rate: 12.5,
        extra_minutes: 2767, extra_text: "1 d 22 h 7 m",
        billable_days: 2, day_charge: 600, billable_hours: 0, hour_charge: 0,
        time_charge: 600, change_fee: 0, total: 600, waived: false, invoice_id: null as string | null,
    },
};
const INVOICE_ID = "77777777-7777-4777-8777-777777777777";
const withInvoice = () => ({ ...RESULT, charge: { ...RESULT.charge, invoice_id: INVOICE_ID } });

beforeEach(() => {
    queues = { subscriptions: [{ data: { id: SUBSCRIPTION_ID }, error: null }] };
    rpcCalls = [];
    rpcResult = { data: RESULT, error: null };
    notifyUser.mockReset();
    recordOfflinePayment.mockReset();
});

describe("request validation", () => {
    it("accepts a date and a 24-hour HH:MM time", () => {
        expect(previewBillingCycleBody.safeParse({ new_due_on: "2026-11-15", new_due_time: "20:00" }).success).toBe(true);
        expect(previewBillingCycleBody.safeParse({ new_due_on: "2026-11-15", new_due_time: "00:05" }).success).toBe(true);
    });

    it("rejects 12-hour, seconds, and out-of-range times", () => {
        for (const t of ["8:00 PM", "20:00:00", "24:00", "7:5"]) {
            expect(previewBillingCycleBody.safeParse({ new_due_on: "2026-11-15", new_due_time: t }).success).toBe(false);
        }
    });

    it("requires a reason to apply, but not to preview", () => {
        const base = { new_due_on: "2026-11-15", new_due_time: "20:00" };
        expect(applyBillingCycleBody.safeParse(base).success).toBe(false);
        expect(applyBillingCycleBody.safeParse({ ...base, reason: "  " }).success).toBe(false);
        expect(applyBillingCycleBody.safeParse({ ...base, reason: "Salary date" }).success).toBe(true);
    });

    it("caps the settings' max extra days at 60 and rejects fractions", () => {
        expect(updateBillingCycleSettingsBody.safeParse({ allow_overdue_change: true, max_extra_days: 7, charge_enabled: true, change_fee: 0 }).success).toBe(true);
        expect(updateBillingCycleSettingsBody.safeParse({ allow_overdue_change: true, max_extra_days: 61, charge_enabled: true, change_fee: 0 }).success).toBe(false);
        expect(updateBillingCycleSettingsBody.safeParse({ allow_overdue_change: true, max_extra_days: 1.5, charge_enabled: true, change_fee: 0 }).success).toBe(false);
    });
});

describe("previewChange", () => {
    it("resolves the booking's subscription and calls the function with p_apply=false", async () => {
        await service.previewChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00" });
        expect(rpcCalls).toEqual([["change_billing_cycle", {
            p_subscription_id: SUBSCRIPTION_ID,
            p_new_due_on: "2026-11-15",
            p_new_cycle_time: "20:00:00",
            p_reason: null,
            p_actor_id: null,
            p_apply: false,
            p_waive_charge: false,
            p_waive_reason: null,
        }]]);
    });

    it("never notifies the rider", async () => {
        await service.previewChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00" });
        expect(notifyUser).not.toHaveBeenCalled();
    });

    it("refuses a booking that has no plan yet", async () => {
        queues.subscriptions = [{ data: null, error: null }];
        await expect(service.previewChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00" }))
            .rejects.toMatchObject({ status: 422 });
        expect(rpcCalls).toHaveLength(0);
    });

    it("turns the function's rule exception into a 422 with the plain message", async () => {
        rpcResult = { data: null, error: { message: "BILLING_CYCLE: The rider is overdue. Changing an overdue rider's billing cycle is turned off in Billing settings." } };
        await expect(service.previewChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00" }))
            .rejects.toMatchObject({
                status: 422,
                message: "The rider is overdue. Changing an overdue rider's billing cycle is turned off in Billing settings.",
            });
    });

    it("re-throws a database error that is not a rule violation", async () => {
        const dbError = { message: "connection reset", code: "08006" };
        rpcResult = { data: null, error: dbError };
        await expect(service.previewChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00" }))
            .rejects.toBe(dbError);
    });
});

describe("applyChange", () => {
    it("writes with p_apply=true, the admin as actor, and the reason", async () => {
        await service.applyChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00", reason: "Salary on 15th" }, ADMIN);
        expect(rpcCalls[0][1]).toMatchObject({ p_apply: true, p_actor_id: (ADMIN as { id: string }).id, p_reason: "Salary on 15th" });
    });

    it("notifies the rider of the new due moment in IST", async () => {
        await service.applyChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00", reason: "Salary on 15th" }, ADMIN);
        expect(notifyUser).toHaveBeenCalledTimes(1);
        const [userId, input] = notifyUser.mock.calls[0];
        expect(userId).toBe(USER_ID);
        expect(input.template).toBe("plan_cycle_changed");
        expect(input.body).toContain("15 Nov 2026 at ");
        expect(input.body.toLowerCase()).toContain("8:00 pm");
    });

    it("does not notify when the function refuses", async () => {
        rpcResult = { data: null, error: { message: "BILLING_CYCLE: The plan is paused for maintenance. Its dates move when it resumes." } };
        await expect(service.applyChange(BOOKING_ID, { new_due_on: "2026-11-15", new_due_time: "20:00", reason: "x y z" }, ADMIN))
            .rejects.toMatchObject({ status: 422 });
        expect(notifyUser).not.toHaveBeenCalled();
    });
});

describe("ruleErrorMessage", () => {
    it("strips the prefix even when Postgres adds context in front", () => {
        expect(service.ruleErrorMessage({ message: "ERROR: BILLING_CYCLE: A return request is open for this rider." }))
            .toBe("A return request is open for this rider.");
    });
    it("is null for anything else", () => {
        expect(service.ruleErrorMessage({ message: "duplicate key" })).toBeNull();
        expect(service.ruleErrorMessage(null)).toBeNull();
    });
});

describe("the charge for extra time", () => {
    const base = { new_due_on: "2026-11-15", new_due_time: "20:00", reason: "Salary on 15th" };

    it("a waive needs its own reason, and can't also be collected", () => {
        expect(applyBillingCycleBody.safeParse({ ...base, waive_charge: true }).success).toBe(false);
        expect(applyBillingCycleBody.safeParse({ ...base, waive_charge: true, waive_reason: "Our scheduling" }).success).toBe(true);
        expect(applyBillingCycleBody.safeParse({ ...base, waive_charge: true, waive_reason: "Our scheduling", collected_method: "cash" }).success).toBe(false);
        expect(applyBillingCycleBody.safeParse({ ...base, collected_method: "cheque" }).success).toBe(false);
    });

    it("passes the waive choice to the database function", async () => {
        await service.applyChange(BOOKING_ID, { ...base, waive_charge: true, waive_reason: "Our scheduling" }, ADMIN);
        expect(rpcCalls[0][1]).toMatchObject({ p_waive_charge: true, p_waive_reason: "Our scheduling" });
    });

    it("records a counter collection against the bill the function raised", async () => {
        rpcResult = { data: withInvoice(), error: null };
        const r = await service.applyChange(BOOKING_ID, { ...base, collected_method: "cash" }, ADMIN);
        expect(recordOfflinePayment).toHaveBeenCalledWith(INVOICE_ID, "cash", ADMIN);
        expect(r.charge.collected).toBe(true);
        expect(notifyUser.mock.calls[0][1].body).toContain("A charge of ₹600 for the change was collected.");
    });

    it("leaves the bill owing (not the change failed) when recording the collection fails", async () => {
        rpcResult = { data: withInvoice(), error: null };
        recordOfflinePayment.mockRejectedValueOnce(new Error("gateway down"));
        const r = await service.applyChange(BOOKING_ID, { ...base, collected_method: "upi" }, ADMIN);
        expect(r.charge.collected).toBe(false);
        expect(notifyUser.mock.calls[0][1].body).toContain("has been added to your bill");
    });

    it("tells the rider the charge was added when they will pay in the app", async () => {
        rpcResult = { data: withInvoice(), error: null };
        await service.applyChange(BOOKING_ID, base, ADMIN);
        expect(recordOfflinePayment).not.toHaveBeenCalled();
        expect(notifyUser.mock.calls[0][1].body).toContain("A charge of ₹600 for the change has been added to your bill.");
    });

    it("says nothing about a charge when none was billed (free, waived, or earlier time)", async () => {
        await service.applyChange(BOOKING_ID, { ...base, collected_method: "cash" }, ADMIN);
        expect(recordOfflinePayment).not.toHaveBeenCalled();
        expect(notifyUser.mock.calls[0][1].body).not.toContain("charge");
    });
});
