import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { groupOf, trialBalanceFrom, profitAndLossFrom, advanceTaxPlan, tallyXml } = await import("../src/modules/books/books.service");
type Posting = Parameters<typeof trialBalanceFrom>[0][number];

const p = (postingDate: string, voucherKey: string, ledger: string, debit: number, credit: number): Posting => ({
    postingDate, voucherKey, voucherType: "Sales", sourceType: "tax_document", sourceId: voucherKey, ledger, debit, credit, narration: "Weekly rent", party: "A Rider",
});

// One paid weekly bill: ₹2,100 rent (5% inclusive) + ₹1,000 deposit, through Razorpay.
const weekly = (date: string, key: string) => [
    p(date, key, "Razorpay Clearing", 3100, 0),
    p(date, key, "Rental Income", 0, 2000),
    p(date, key, "Output CGST", 0, 50),
    p(date, key, "Output SGST", 0, 50),
    p(date, key, "Rider Security Deposits", 0, 1000),
];

describe("groupOf", () => {
    it("puts each ledger under Tally's predefined group", () => {
        expect(groupOf("HDFC Bank")).toBe("Bank Accounts");
        expect(groupOf("Output CGST")).toBe("Duties & Taxes");
        expect(groupOf("Rider Security Deposits")).toBe("Current Liabilities");
        expect(groupOf("Creditor: Razorpay")).toBe("Sundry Creditors");
        expect(groupOf("Fixed Assets - Scooters")).toBe("Fixed Assets");
        expect(groupOf("Rental Income")).toBe("Direct Incomes");
        expect(groupOf("Payment Gateway Fees")).toBe("Indirect Expenses");
    });
});

describe("trialBalanceFrom", () => {
    it("splits opening from period movement and balances", () => {
        const rows = trialBalanceFrom([...weekly("2026-09-20", "v1"), ...weekly("2026-10-05", "v2")], "2026-10-01");
        const rz = rows.find((r) => r.ledger === "Razorpay Clearing")!;
        expect(rz).toMatchObject({ opening: 3100, debit: 3100, credit: 0, closing: 6200 });
        const dep = rows.find((r) => r.ledger === "Rider Security Deposits")!;
        expect(dep.closing).toBe(-2000);
        expect(rows.reduce((t, r) => t + r.debit - r.credit, 0)).toBeCloseTo(0, 2);
    });
});

describe("profitAndLossFrom", () => {
    it("counts income and expenses only — never tax, deposits or bank", () => {
        const pl = profitAndLossFrom([
            ...weekly("2026-10-05", "v1"),
            p("2026-10-06", "v3", "Payment Gateway Fees", 62, 0),
            p("2026-10-06", "v3", "Input GST on Gateway Fees", 11.16, 0),
            p("2026-10-06", "v3", "Razorpay Clearing", 0, 73.16),
        ], "2026-10-01", "2026-10-31");
        expect(pl.totalIncome).toBe(2000);
        expect(pl.totalExpenses).toBe(62);
        expect(pl.profit).toBe(1938);
    });
});

describe("advanceTaxPlan", () => {
    it("annualises the profit and applies 30% + 4% cess, in 15/45/75/100% instalments", () => {
        const plan = advanceTaxPlan(500000, 6, 10000, 2026);
        expect(plan.projectedProfit).toBe(1000000);
        expect(plan.estimatedTax).toBe(312000);
        expect(plan.instalments.map((i) => i.cumulativeDue)).toEqual([46800, 140400, 234000, 312000]);
        expect(plan.instalments[3].dueOn).toBe("2027-03-15");
    });

    it("adds the 12% surcharge above ₹1 crore and is nothing on a loss", () => {
        expect(advanceTaxPlan(12_000_000, 12, 0, 2026).estimatedTax).toBe(4193280);
        expect(advanceTaxPlan(-5000, 3, 0, 2026).estimatedTax).toBe(0);
    });
});

describe("tallyXml", () => {
    it("writes debits as negative ISDEEMEDPOSITIVE amounts and escapes names", () => {
        const out = tallyXml([...weekly("2026-10-05", "v1"), p("2026-10-06", "v4", "Creditor: A & B", 0, 10), p("2026-10-06", "v4", "Rent", 10, 0)], "Swapngo Fleet Hub");
        expect(out).toContain('<LEDGER NAME="Creditor: A &amp; B" ACTION="Create"><NAME>Creditor: A &amp; B</NAME><PARENT>Sundry Creditors</PARENT>');
        expect(out).toContain("<LEDGERNAME>Razorpay Clearing</LEDGERNAME><ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE><AMOUNT>-3100.00</AMOUNT>");
        expect(out).toContain("<LEDGERNAME>Rental Income</LEDGERNAME><ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE><AMOUNT>2000.00</AMOUNT>");
        expect(out).toContain("<DATE>20261005</DATE>");
        expect(out.match(/<VOUCHER /g)).toHaveLength(2);
    });
});
