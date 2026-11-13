import { describe, expect, it, vi } from "vitest";
import { createFakeSupabase, type QueryRecord } from "./helpers/fakeSupabase";

/**
 * Regression: the tax-document select once embedded the original document
 * through its own foreign key, `tax_documents!tax_documents_original_document_id_fkey`.
 * PostgREST rejects that self-referencing hint (PGRST200), so every register,
 * return and PDF query failed on UAT with a 500. The original number is now
 * read by a second, plain query.
 */

let handle: (q: QueryRecord) => { data?: unknown; error?: unknown } = () => ({ data: null });
const fake = createFakeSupabase((q) => handle(q));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: fake }));
vi.mock("../src/common/audit", () => ({ writeAudit: vi.fn(async () => {}) }));

const { listTaxDocuments } = await import("../src/modules/gst/gst.service");

const doc = (over: Record<string, unknown>) => ({
    id: "d1", doc_type: "tax_invoice", source: "invoice_paid", series_code: "SNGT-FY2627", doc_number: "SNGT/2627/000001",
    supply_date: "2026-11-03", issued_on: "2026-11-03", user_id: "u1", invoice_id: "i1", rental_id: null, refund_id: null,
    original_document_id: null, gst_settings_id: "g1", recipient_name: "A Rider", place_of_supply: "33", sac_code: "9973",
    gst_rate: 5, taxable_amount: 2000, cgst_amount: 50, sgst_amount: 50, igst_amount: 0, total_amount: 2100, lines: [],
    status: "issued", created_at: "2026-11-03T10:00:00Z", return_period: "2026-11-01", invoices: { invoice_number: "SNG/2627/000040" },
    ...over,
});

describe("tax document queries", () => {
    it("never embeds tax_documents into itself, and still shows a credit note's original number", async () => {
        handle = (q) => {
            if (q.table !== "tax_documents") return { data: null };
            if (q.filters.some((f) => f[0] === "in")) return { data: [{ id: "d1", doc_number: "SNGT/2627/000001" }] };
            return { data: [doc({}), doc({ id: "c1", doc_type: "credit_note", source: "refund", doc_number: "SNGC/2627/000001", original_document_id: "d1", total_amount: 1050 })] };
        };
        const page = await listTaxDocuments({ from: "2026-11-01", to: "2026-11-30", page: 1, pageSize: 15 });

        for (const q of fake.on("tax_documents")) expect(q.select ?? "").not.toMatch(/tax_documents!/);
        const credit = page.data.find((d) => d.docType === "credit_note")!;
        expect(credit.originalDocNumber).toBe("SNGT/2627/000001");
        expect(page.data.find((d) => d.docType === "tax_invoice")!.originalDocNumber).toBeNull();
    });
});
