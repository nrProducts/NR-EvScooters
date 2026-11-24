import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase, written, type QueryRecord } from "./helpers/fakeSupabase";

/**
 * Notes on bank lines (supabase/migrations/20261124100000_bank_line_notes.sql):
 * the "why" behind a line, e.g. what an "Other expense" was for. Editable,
 * never touches the category or the match, and every change is audited.
 */

let handle: (q: QueryRecord) => { data?: unknown; error?: unknown } = () => ({ data: null });
const fake = createFakeSupabase((q) => handle(q));
vi.mock("../src/config/supabase", () => ({ supabaseAdmin: fake }));
const writeAudit = vi.fn(async () => {});
vi.mock("../src/common/audit", () => ({ writeAudit }));

const { setLineNote, listBankLines } = await import("../src/modules/reconciliation/bank.service");
const { lineNoteBody } = await import("../src/modules/reconciliation/reconciliation.validation");

const actor = { id: "staff-1", role: "admin" } as never;
const LINE = {
    id: "line-1", statement_id: "st-1", source: "hdfc", line_no: 4, external_id: "N123", kind: "bank_debit",
    occurred_at: "2026-10-27T00:00:00+05:30", value_date: "2026-10-27", amount: "-25", net_amount: "-25", fee: "0", tax: "0",
    method: null, gateway_order_id: null, description: "NEFT DR-UTIB0000168-RUKESHKUMAR K", running_balance: "1000",
    counterparty_key: "RUKESHKUMAR K", category: "other_expense", category_source: "manual", match_status: "matched",
    exception_code: null, payment_transaction_id: null, refund_id: null, matched_statement_id: null,
    resolved_at: null, resolved_note: null, payment_transactions: null, refunds: null,
};

function db(row: Record<string, unknown> | null) {
    let current = row ? { ...row } : null;
    handle = (q) => {
        if (q.table !== "external_statement_lines") return { data: null };
        if (q.op === "update") {
            current = { ...current, ...q.payload, note_author: q.payload?.note ? { full_name: "Swapngo Admin" } : null };
            return { data: null };
        }
        return { data: current };
    };
}

beforeEach(() => { fake.queries.length = 0; writeAudit.mockClear(); });

describe("setLineNote", () => {
    it("saves a note with who wrote it and when, without touching the category or match", async () => {
        db({ ...LINE, note: null });
        const row = await setLineNote("line-1", { note: "  Tea for hub staff  " }, actor);

        const update = fake.on("external_statement_lines", "update")[0];
        expect(written(update, "note")).toBe("Tea for hub staff");
        expect(written(update, "note_by_user_id")).toBe("staff-1");
        expect(written(update, "note_at")).toEqual(expect.any(String));
        expect(Object.keys(update.payload!)).toEqual(["note", "note_by_user_id", "note_at"]);

        expect(row.note).toBe("Tea for hub staff");
        expect(row.noteBy).toBe("Swapngo Admin");
        expect(row.category).toBe("other_expense");
        expect(row.matchStatus).toBe("matched");
        expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({
            action: "settlement.bank_line_note_updated", entityId: "line-1",
            before: { note: null }, after: { note: "Tea for hub staff" },
        }));
    });

    it("clears the note when it is empty", async () => {
        db({ ...LINE, note: "Old note" });
        const row = await setLineNote("line-1", { note: "   " }, actor);

        const update = fake.on("external_statement_lines", "update")[0];
        expect(update.payload).toEqual({ note: null, note_by_user_id: null, note_at: null });
        expect(row.note).toBeNull();
        expect(writeAudit).toHaveBeenCalledWith(expect.objectContaining({ before: { note: "Old note" }, after: { note: null } }));
    });

    it("writes nothing when the note is unchanged", async () => {
        db({ ...LINE, note: "Same" });
        await setLineNote("line-1", { note: "Same" }, actor);
        expect(fake.on("external_statement_lines", "update")).toHaveLength(0);
        expect(writeAudit).not.toHaveBeenCalled();
    });

    it("refuses a line that is not an HDFC bank line", async () => {
        db({ ...LINE, source: "razorpay", note: null });
        await expect(setLineNote("line-1", { note: "x" }, actor)).rejects.toThrow("Bank line not found.");
        db(null);
        await expect(setLineNote("line-1", { note: "x" }, actor)).rejects.toThrow("Bank line not found.");
        expect(fake.on("external_statement_lines", "update")).toHaveLength(0);
    });
});

describe("lineNoteBody", () => {
    it("allows empty (clear) and up to 500 characters", () => {
        expect(lineNoteBody.safeParse({ note: "" }).success).toBe(true);
        expect(lineNoteBody.safeParse({ note: "a".repeat(500) }).success).toBe(true);
        expect(lineNoteBody.safeParse({ note: "a".repeat(501) }).success).toBe(false);
        expect(lineNoteBody.safeParse({}).success).toBe(false);
    });
});

describe("listBankLines search", () => {
    it("also searches the note text", async () => {
        handle = () => ({ data: [] });
        await listBankLines({ from: "2026-10-01", to: "2026-10-31", filter: "all", search: "tea", page: 1, pageSize: 15 });
        const or = fake.on("external_statement_lines")[0].filters.find((f) => f[0] === "or");
        expect(or?.[1]).toContain("note.ilike.%tea%");
    });
});
