import { describe, expect, it, vi } from "vitest";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

vi.mock("../src/config/supabase", () => ({ supabaseAdmin: {} }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const service = await import("../src/modules/gst/gst.service");
const { amountInWords, formatDocDate, renderTaxDocumentPdf } = await import("../src/modules/gst/gst.pdf");
type Row = import("../src/modules/gst/gst.types").TaxDocumentRow;

function doc(over: Partial<Row> = {}): Row {
    return {
        id: "doc-1", docType: "tax_invoice", source: "invoice_paid", docNumber: "SNGT/2627/000001",
        supplyDate: "2026-11-01", issuedOn: "2026-11-01", userId: "rider-1", recipientName: "R. Kumar",
        invoiceId: "inv-1", billNumber: "SNG/2627/000101", rentalId: null, refundId: null,
        originalDocumentId: null, originalDocNumber: null, placeOfSupply: "33", sacCode: "9973", gstRate: 5,
        taxableAmount: 2476.19, cgstAmount: 61.9, sgstAmount: 61.91, igstAmount: 0, totalAmount: 2600,
        status: "issued",
        lines: [
            { description: "Self-drive EV scooter rental", sac: "9973", gross: 2100, taxable: 2000, cgst: 50, sgst: 50 },
            { description: "One-time onboarding charge (non-refundable)", sac: "9973", gross: 500, taxable: 476.19, cgst: 11.9, sgst: 11.91 },
        ],
        createdAt: "2026-11-01T10:00:00Z",
        ...over,
    };
}

describe("GSTIN check digit", () => {
    it("accepts Swapngo Fleet Hub's own GSTIN from the registration certificate", () => {
        expect(service.isValidGstinChecksum("33AGAFS3923J1Z0")).toBe(true);
    });

    it("rejects a single mistyped character", () => {
        expect(service.isValidGstinChecksum("33AGAFS3923J1Z1")).toBe(false);
        expect(service.isValidGstinChecksum("33AGAFS3932J1Z0")).toBe(false);
    });

    it("rejects anything that is not GSTIN-shaped", () => {
        expect(service.isValidGstinChecksum("33agafs3923j1z0")).toBe(false);
        expect(service.isValidGstinChecksum("")).toBe(false);
    });
});

describe("summarise", () => {
    it("nets credit notes off tax invoices and ignores cancelled documents", () => {
        const s = service.summarise([
            doc(),
            doc({ id: "d2", docNumber: "SNGT/2627/000002", taxableAmount: 2000, cgstAmount: 50, sgstAmount: 50, totalAmount: 2100 }),
            doc({ id: "d3", docNumber: "SNGT/2627/000003", status: "cancelled" }),
            doc({
                id: "c1", docType: "credit_note", source: "refund", docNumber: "SNGC/2627/000001",
                taxableAmount: 1714.29, cgstAmount: 42.85, sgstAmount: 42.86, totalAmount: 1800,
            }),
        ], "2026-11-01", "2026-11-30");

        expect(s.taxInvoices).toMatchObject({
            count: 2, taxable: 4476.19, cgst: 111.9, sgst: 111.91, total: 4700,
            firstNumber: "SNGT/2627/000001", lastNumber: "SNGT/2627/000002",
        });
        expect(s.creditNotes).toMatchObject({ count: 1, total: 1800 });
        expect(s.net).toEqual({ taxable: 2761.9, cgst: 69.05, sgst: 69.05, total: 2900 });
        expect(s.cancelledCount).toBe(1);
    });
});

describe("amountInWords", () => {
    it("uses the Indian system and includes paise", () => {
        expect(amountInWords(2600)).toBe("Indian Rupees Two Thousand Six Hundred Only");
        expect(amountInWords(476.19)).toBe("Indian Rupees Four Hundred Seventy Six and Paise Nineteen Only");
        expect(amountInWords(1250000)).toBe("Indian Rupees Twelve Lakh Fifty Thousand Only");
    });
});

describe("formatDocDate", () => {
    it("prints the stored IST date without shifting it", () => {
        expect(formatDocDate("2026-11-02")).toBe("02 Nov 2026");
    });
});

describe("rider document links", () => {
    it("verifies its own token and rejects a tampered or expired one", async () => {
        // createMyDocumentLink needs the database; build the same token the
        // way it does, through the exported verifier's counterpart.
        const { createHmac } = await import("node:crypto");
        const key = createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update("swapngo:gst-document-link:v1").digest();
        const make = (exp: number) => {
            const payload = Buffer.from(JSON.stringify({ d: "doc-1", u: "rider-1", e: exp })).toString("base64url");
            return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
        };
        const now = 1_800_000_000;

        expect(service.verifyDocumentLinkToken(make(now + 60), now)).toEqual({ docId: "doc-1", userId: "rider-1" });
        expect(service.verifyDocumentLinkToken(make(now - 1), now)).toBeNull();

        const good = make(now + 60);
        const forgedPayload = Buffer.from(JSON.stringify({ d: "doc-2", u: "rider-1", e: now + 60 })).toString("base64url");
        expect(service.verifyDocumentLinkToken(`${forgedPayload}.${good.split(".")[1]}`, now)).toBeNull();
        expect(service.verifyDocumentLinkToken("not-a-token", now)).toBeNull();
    });
});

describe("register CSV", () => {
    it("carries the net figures and one row per document", () => {
        const docs = [doc()];
        const csv = service.renderRegisterCsv(docs, service.summarise(docs, "2026-11-01", "2026-11-30")).toString("utf8");
        expect(csv).toContain("Net taxable value,2476.19");
        expect(csv).toContain("SNGT/2627/000001");
        expect(csv.split("\r\n").filter((l) => l.startsWith("Tax invoice"))).toHaveLength(1);
    });
});

describe("renderTaxDocumentPdf", () => {
    it("produces a PDF for a tax invoice and a credit note", async () => {
        const seller = {
            id: "s1", effectiveFrom: "2026-09-02", legalName: "Swapngo Fleet Hub", tradeName: "Swapngo Fleet Hub",
            gstin: "33AGAFS3923J1Z0", stateCode: "33", stateName: "Tamil Nadu",
            address: "No. 5/61, Pillaiyar Kovil Street, Chennai, Tamil Nadu 600100",
            sacCode: "9973", gstRate: 5, createdAt: "2026-11-03T00:00:00Z", inUse: true, isCurrent: true,
        };
        const invoice = await renderTaxDocumentPdf(doc(), seller);
        const credit = await renderTaxDocumentPdf(
            doc({ docType: "credit_note", source: "refund", docNumber: "SNGC/2627/000001", originalDocNumber: "SNGT/2627/000001" }),
            seller,
        );
        expect(invoice.subarray(0, 5).toString()).toBe("%PDF-");
        expect(credit.subarray(0, 5).toString()).toBe("%PDF-");
    });
});
