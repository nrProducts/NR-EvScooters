import { describe, expect, it, vi } from "vitest";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { computeSetOff, lateEstimate, gstr1Json } = await import("../src/modules/gst/gst.returns");

describe("computeSetOff", () => {
    it("pays reverse charge in cash and uses IGST credit before CGST/SGST credit (the design's worked month)", () => {
        // Outward CGST 9,561.90 / SGST 9,561.91; reverse charge IGST 756.00.
        // Credit: IGST 3,859.20 (incl. 756 RCM claimed back), CGST 450, SGST 450.
        const s = computeSetOff({ igst: 756, cgst: 9561.9, sgst: 9561.91 }, 756, { igst: 3859.2, cgst: 450, sgst: 450 });
        expect(s.cash.igst).toBe(756);
        expect(s.creditUsed.igstAgainstCgst).toBe(3859.2);
        expect(s.creditUsed.igstAgainstSgst).toBe(0);
        expect(s.cash.cgst).toBe(5252.7);
        expect(s.cash.sgst).toBe(9111.91);
        expect(s.cash.total).toBe(15120.61);
        expect(s.creditCarriedForward).toEqual({ igst: 0, cgst: 0, sgst: 0 });
    });

    it("carries forward credit that exceeds the liability", () => {
        const s = computeSetOff({ igst: 0, cgst: 100, sgst: 100 }, 0, { igst: 500, cgst: 10, sgst: 10 });
        expect(s.cash.total).toBe(0);
        expect(s.creditCarriedForward).toEqual({ igst: 300, cgst: 10, sgst: 10 });
    });
});

describe("lateEstimate", () => {
    it("is nothing when on time", () => {
        expect(lateEstimate(0, 10000, false)).toEqual({ daysLate: 0, interest: 0, lateFee: 0 });
    });

    it("charges ₹50 a day capped at ₹2,000, and 18% a year interest on the cash", () => {
        expect(lateEstimate(10, 36500, false)).toEqual({ daysLate: 10, interest: 180, lateFee: 500 });
        expect(lateEstimate(60, 0, false).lateFee).toBe(2000);
        expect(lateEstimate(60, 0, true).lateFee).toBe(500);
    });
});

describe("gstr1Json", () => {
    it("builds B2CS, the B2C HSN summary and the documents-issued table", () => {
        const json = gstr1Json({
            month: "2026-10",
            gstin: "33AGAFS3923J1Z0",
            gstr1: {
                table7: [{ rate: 5, placeOfSupply: "33", taxable: 382476.19, cgst: 9561.9, sgst: 9561.91 }],
                table12: [{ sac: "9973", rate: 5, taxable: 382476.19, cgst: 9561.9, sgst: 9561.91, total: 401600 }],
                table13: [
                    { nature: "Invoices for outward supply", from: "SNGT/2627/000001", to: "SNGT/2627/000196", total: 196, cancelled: 0, net: 196 },
                    { nature: "Credit notes", from: null, to: null, total: 0, cancelled: 0, net: 0 },
                ],
            },
        });
        expect(json.fp).toBe("102026");
        expect(json.b2cs).toEqual([{ sply_ty: "INTRA", rt: 5, typ: "OE", pos: "33", txval: 382476.19, camt: 9561.9, samt: 9561.91, csamt: 0 }]);
        expect((json.doc_issue as { doc_det: unknown[] }).doc_det).toHaveLength(1);
    });
});
