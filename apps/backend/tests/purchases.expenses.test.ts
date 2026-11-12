import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryRecord } from "./helpers/fakeSupabase";

/**
 * Simple expenses (supabase/migrations/20261111100000_simple_expenses.sql):
 * one step from "we paid X for Y" to a confirmed bill that says how it was
 * paid — so cash and partner payments no longer sit in Payables for ever.
 */

let handle: (q: QueryRecord) => { data?: unknown; error?: unknown } = () => ({ data: null });
const fake = createFakeSupabase((q) => handle(q));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: fake }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { createExpense, splitExpenseAmount, settledWithoutBankLine, setBillPaymentMethod } = await import("../src/modules/purchases/purchases.service");
const { groupOf } = await import("../src/modules/books/books.service");

const actor = { id: "staff-1", role: "admin" } as never;
const VENDOR = { id: "v1", name: "Ravi Stores", gstin: null, pan: null, state_code: null, address: null, kind: "other", default_category: "office_expenses", contact_email: null, contact_phone: null, is_active: true };

/** A database with one bill being written; `vendorRow` is what a lookup by name finds. */
function db(opts: { vendorRow?: Record<string, unknown> | null; filed?: boolean; billNumberTaken?: boolean } = {}) {
    let vendor = opts.vendorRow ?? null;
    let bill: Record<string, unknown> | null = null;
    let lines: Record<string, unknown>[] = [];
    handle = (q) => {
        if (q.table === "vendors") {
            if (q.op === "insert") { vendor = { ...VENDOR, ...q.payload, id: "v-new" }; return { data: vendor }; }
            if (q.op === "update") { vendor = { ...vendor, ...q.payload }; return { data: vendor }; }
            if (q.filters.some((x) => x[0] === "ilike")) return { data: vendor ? [vendor] : [] };
            return { data: vendor };
        }
        if (q.table === "finance_periods") return { data: opts.filed ? { gstr3b_status: "filed" } : null };
        if (q.table === "purchase_bills") {
            if (q.op === "insert") {
                if (opts.billNumberTaken) return { error: { code: "23505" } };
                bill = { ...q.payload, id: "b1", status: "draft", source: "manual", file_path: null, cancel_reason: null, created_at: "2026-11-11T10:00:00Z", paid_via: null, paid_on: null, paid_by: null, place_of_supply: "33", gstr2b_status: q.payload?.gstr2b_status };
                return { data: { id: "b1" } };
            }
            if (q.op === "update") { bill = { ...bill, ...q.payload }; return { data: null }; }
            if (q.op === "delete") { bill = null; return { data: null }; }
            if (!bill) return { data: null };
            const total = lines.reduce((t, l) => t + Number(l.total_amount), 0);
            return { data: { ...bill, taxable_amount: lines.reduce((t, l) => t + Number(l.taxable_amount), 0), cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_amount: total, vendors: { name: vendor?.name, gstin: vendor?.gstin } } };
        }
        if (q.table === "purchase_bill_lines") {
            if (q.op === "insert") { lines = q.payload as unknown as Record<string, unknown>[]; return { data: null }; }
            return { data: lines.map((l, i) => ({ id: `l${i}`, ...l })) };
        }
        if (q.table === "external_statement_lines") return { data: [] };
        return { data: null };
    };
}

beforeEach(() => { fake.queries.length = 0; });

describe("splitExpenseAmount", () => {
    it("takes the amount paid as GST-inclusive and splits the tax by the supplier's state", () => {
        expect(splitExpenseAmount(1180, 18, "33")).toEqual({ taxable: 1000, cgst: 90, sgst: 90, igst: 0 });
        expect(splitExpenseAmount(1180, 18, "29")).toEqual({ taxable: 1000, cgst: 0, sgst: 0, igst: 180 });
        expect(splitExpenseAmount(2100, 5, null)).toEqual({ taxable: 2000, cgst: 50, sgst: 50, igst: 0 });
    });

    it("puts the odd paisa in SGST and charges nothing without a rate", () => {
        const s = splitExpenseAmount(100, 5, "33");
        expect(s.taxable).toBe(95.24);
        expect(s.cgst + s.sgst).toBeCloseTo(4.76, 2);
        expect(s.sgst - s.cgst).toBeCloseTo(0, 2);
        expect(splitExpenseAmount(25, 0, null)).toEqual({ taxable: 25, cgst: 0, sgst: 0, igst: 0 });
    });
});

describe("settledWithoutBankLine", () => {
    it("treats cash, partner and paid-at-source bills as paid; a bank bill waits for its line", () => {
        expect(settledWithoutBankLine({ paid_via: "cash", source: "manual" })).toBe(true);
        expect(settledWithoutBankLine({ paid_via: "partner", source: "manual" })).toBe(true);
        expect(settledWithoutBankLine({ paid_via: null, source: "razorpay_fees" })).toBe(true);
        expect(settledWithoutBankLine({ paid_via: null, source: "bank_charges" })).toBe(true);
        expect(settledWithoutBankLine({ paid_via: "bank", source: "manual" })).toBe(false);
        expect(settledWithoutBankLine({ paid_via: null, source: "manual" })).toBe(false);
    });

    it("files a partner's own account under Capital Account in the books", () => {
        expect(groupOf("Partner: Rukeshkumar K")).toBe("Capital Account");
        expect(groupOf("Office Expenses")).toBe("Indirect Expenses");
    });
});

describe("createExpense", () => {
    it("records a cash expense with a new payee and no GST as a confirmed, paid bill", async () => {
        db();
        const bill = await createExpense({ date: "2026-10-27", payee: "Ravi Stores", category: "office_expenses", amount: 25, hasGst: false, paidVia: "cash" }, actor);

        const vendorInsert = fake.on("vendors", "insert")[0];
        expect(vendorInsert.payload).toMatchObject({ name: "Ravi Stores", kind: "other", gstin: null, default_category: "office_expenses" });
        const line = (fake.on("purchase_bill_lines", "insert")[0].payload as unknown as Record<string, unknown>[])[0];
        expect(line).toMatchObject({ taxable_amount: 25, gst_rate: 0, cgst_amount: 0, sgst_amount: 0, igst_amount: 0, total_amount: 25 });
        const billInsert = fake.on("purchase_bills", "insert")[0];
        expect(String(written(billInsert, "bill_number"))).toMatch(/^EXP-20261027-[0-9A-F]{4}$/);
        expect(written(billInsert, "itc_month")).toBe("2026-10-01");
        const confirm = fake.on("purchase_bills", "update")[0];
        expect(confirm.payload).toMatchObject({ status: "confirmed", paid_via: "cash", paid_on: "2026-10-27", paid_by: null, gstr2b_status: "not_applicable" });
        expect(bill.paidAmount).toBe(25);
    });

    it("splits GST on a GST bill, saves the GSTIN on the existing payee, and records the partner who paid", async () => {
        db({ vendorRow: { ...VENDOR } });
        await createExpense({
            date: "2026-11-03", payee: "ravi stores", category: "office_expenses", amount: 1180,
            hasGst: true, gstRate: 18, gstin: "33aaach2702h1z7", billNumber: "RS/221", paidVia: "partner", paidBy: "Rukeshkumar K",
        }, actor);

        expect(fake.on("vendors", "insert")).toHaveLength(0);
        expect(fake.on("vendors", "update")[0].payload).toMatchObject({ gstin: "33AAACH2702H1Z7", state_code: "33" });
        const line = (fake.on("purchase_bill_lines", "insert")[0].payload as unknown as Record<string, unknown>[])[0];
        expect(line).toMatchObject({ taxable_amount: 1000, gst_rate: 18, cgst_amount: 90, sgst_amount: 90, igst_amount: 0, itc_status: "eligible" });
        expect(written(fake.on("purchase_bills", "insert")[0], "bill_number")).toBe("RS/221");
        expect(fake.on("purchase_bills", "update")[0].payload).toMatchObject({ paid_via: "partner", paid_by: "Rukeshkumar K", gstr2b_status: "not_checked" });
    });

    it("cannot claim GST from a bill without the supplier's GSTIN: the tax becomes cost", async () => {
        db();
        await createExpense({ date: "2026-11-03", payee: "Local Garage", category: "office_expenses", amount: 590, hasGst: true, gstRate: 18, paidVia: "bank" }, actor);
        const line = (fake.on("purchase_bill_lines", "insert")[0].payload as unknown as Record<string, unknown>[])[0];
        expect(line).toMatchObject({ taxable_amount: 500, itc_status: "ineligible" });
        expect(String(line.itc_reason)).toMatch(/GSTIN/);
        // Paid from HDFC: settled later by linking the bank line, so no paid_on yet.
        expect(fake.on("purchase_bills", "update")[0].payload).toMatchObject({ paid_via: "bank", paid_on: null, gstr2b_status: "not_applicable" });
    });

    it("claims credit in the current month when the bill's month is already filed", async () => {
        db({ filed: true });
        await createExpense({ date: "2026-10-15", payee: "Ravi Stores", category: "office_expenses", amount: 118, hasGst: false, paidVia: "cash" }, actor);
        const itcMonth = String(written(fake.on("purchase_bills", "insert")[0], "itc_month"));
        expect(itcMonth).not.toBe("2026-10-01");
        expect(itcMonth).toMatch(/^\d{4}-\d{2}-01$/);
    });

    it("needs the partner's name, and tells the user when their bill number is already entered", async () => {
        db();
        await expect(createExpense({ date: "2026-11-03", payee: "Ravi Stores", category: "office_expenses", amount: 10, hasGst: false, paidVia: "partner" }, actor))
            .rejects.toThrow(/partner who paid/);
        db({ billNumberTaken: true });
        await expect(createExpense({ date: "2026-11-03", payee: "Ravi Stores", category: "office_expenses", amount: 10, hasGst: false, billNumber: "RS/1", paidVia: "cash" }, actor))
            .rejects.toThrow(/already entered/);
    });
});

describe("setBillPaymentMethod", () => {
    it("refuses cash on a bill that already has an HDFC payment linked", async () => {
        db({ vendorRow: { ...VENDOR } });
        await createExpense({ date: "2026-11-03", payee: "Ravi Stores", category: "office_expenses", amount: 100, hasGst: false, paidVia: "bank" }, actor);
        const original = handle;
        handle = (q) => (q.table === "external_statement_lines" ? { data: [{ id: "bank-1", value_date: "2026-11-04", amount: -100, description: "UPI" }] } : original(q));
        await expect(setBillPaymentMethod("b1", { paidVia: "cash" }, actor)).rejects.toThrow(/bank payment is linked/);
    });
});
