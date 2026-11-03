import { describe, expect, it, vi } from "vitest";

vi.mock("../src/config/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { splitPurchaseTax, reverseChargeIgst, categoryOf } = await import("../src/modules/purchases/purchases.itc");
const { buildLineRows, parseGstr2b, writtenDownValue } = await import("../src/modules/purchases/purchases.service");

describe("splitPurchaseTax", () => {
    it("charges IGST on an inter-state supply and CGST + SGST within Tamil Nadu", () => {
        expect(splitPurchaseTax(1000, 18, { supplierState: "29", reverseCharge: false })).toEqual({ cgst: 0, sgst: 0, igst: 180 });
        expect(splitPurchaseTax(1000, 18, { supplierState: "33", reverseCharge: false })).toEqual({ cgst: 90, sgst: 90, igst: 0 });
        expect(splitPurchaseTax(100.01, 5, { supplierState: "33", reverseCharge: false })).toEqual({ cgst: 2.5, sgst: 2.5, igst: 0 });
    });

    it("puts no GST on a reverse-charge bill; Swapngo's own IGST is computed apart", () => {
        expect(splitPurchaseTax(4200, 18, { supplierState: null, reverseCharge: true })).toEqual({ cgst: 0, sgst: 0, igst: 0 });
        expect(reverseChargeIgst(4200, 18)).toBe(756);
    });
});

describe("buildLineRows", () => {
    it("takes the category's ITC status and computed heads by default", () => {
        const [row] = buildLineRows("bill-1", [
            { description: "Ather 450S", category: "vehicle_purchase", taxableAmount: 135714.29, gstRate: 5 },
        ], { state_code: "29" }, false);
        expect(row).toMatchObject({ itc_status: "blocked", is_capital: true, igst_amount: 6785.71, total_amount: 142500 });
        expect(String(row.itc_reason)).toMatch(/17\(5\)\(a\)/);
    });

    it("refuses to change an ITC status without a reason", () => {
        expect(() => buildLineRows("bill-1", [
            { description: "Tyres", category: "spare_parts", taxableAmount: 1000, gstRate: 28, itcStatus: "eligible" },
        ], { state_code: "33" }, false)).toThrow(/needs a reason/);
        expect(categoryOf("spare_parts")?.itc).toBe("review");
    });

    it("refuses a line that mixes IGST with CGST + SGST", () => {
        expect(() => buildLineRows("bill-1", [
            { description: "x", category: "rent", taxableAmount: 100, gstRate: 18, igstAmount: 18, cgstAmount: 9 },
        ], { state_code: "33" }, false)).toThrow(/either IGST or CGST/);
    });
});

describe("parseGstr2b", () => {
    it("reads B2B invoices and credit notes from the portal's JSON", () => {
        const parsed = parseGstr2b({
            data: {
                rtnprd: "102026",
                docdata: {
                    b2b: [{ ctin: "29aaacr5055k1z5", trdnm: "Sample Gateway", inv: [{ inum: "INV/10/123", dt: "31-10-2026", txval: 438, igst: 78.84, cgst: 0, sgst: 0 }] }],
                    cdnr: [{ ctin: "33AAACH2702H1Z7", trdnm: "Sample Bank", nt: [{ ntnum: "CN-9", dt: "15-10-2026", items: [{ txval: 10, cgst: 0.9, sgst: 0.9 }] }] }],
                },
            },
        });
        expect(parsed.period).toBe("2026-10");
        expect(parsed.docs).toEqual([
            { ctin: "29AAACR5055K1Z5", tradeName: "Sample Gateway", number: "INV/10/123", date: "2026-10-31", taxable: 438, igst: 78.84, cgst: 0, sgst: 0, isCredit: false },
            { ctin: "33AAACH2702H1Z7", tradeName: "Sample Bank", number: "CN-9", date: "2026-10-15", taxable: 10, igst: 0, cgst: 0.9, sgst: 0.9, isCredit: true },
        ]);
    });
});

describe("writtenDownValue", () => {
    it("takes half the rate in a year the asset was used under 180 days", () => {
        // Bought 1 Nov 2026: 151 days to 31 Mar 2027, so 7.5% that year.
        expect(writtenDownValue(100000, "2026-11-01", 15, "2027-01-15")).toBe(92500);
        // A full 15% the next year.
        expect(writtenDownValue(100000, "2026-11-01", 15, "2027-06-01")).toBe(78625);
    });

    it("takes the full rate when used 180 days or more", () => {
        expect(writtenDownValue(100000, "2026-09-02", 15, "2027-03-31")).toBe(85000);
    });
});
