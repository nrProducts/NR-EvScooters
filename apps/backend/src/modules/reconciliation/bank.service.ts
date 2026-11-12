import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { badRequest, businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { paginate, toRange } from "../../common/pagination";
import type { AuthContext, Paginated } from "../../types";
import {
    MONEY_IN_CATEGORIES, MONEY_OUT_CATEGORIES, checkStatementArithmetic, parseDelimited, parseHdfcStatement,
    readNarration, utrCandidates, type BankCategory, type ParsedBankStatement,
} from "./hdfc.parser";
import { LINE_COLUMNS, monthBounds, toLineRow, type RawLine } from "./statements.service";
import type { StatementLineRow } from "./statements.types";

/**
 * Stage 3 — HDFC statement import and the three-way match.
 *
 * An uploaded export becomes one `external_statements` row (source hdfc) and
 * its lines. Nothing is saved unless every check passes; a Razorpay credit is
 * matched to its settlement by UTR, a direct rider payment to the offline
 * payment staff recorded, a transfer to a rider to the refund, and every
 * other line gets a category — learned from how the same counterparty was
 * categorised before.
 *
 * Same untyped client as statements.service.ts, same reason.
 */
const db = supabaseAdmin as unknown as SupabaseClient;
const BUCKET = "finance-documents";
const round2 = (n: number) => Math.round(n * 100) / 100;
const ALL_CATEGORIES = new Set<string>([...MONEY_IN_CATEGORIES, ...MONEY_OUT_CATEGORIES]);

export interface UploadedStatement { buffer: Buffer; originalname: string; mimetype: string }

export interface ImportPreview {
    fileName: string;
    accountRef: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    openingBalance: number | null;
    closingBalance: number | null;
    credits: number;
    debits: number;
    lineCount: number;
    newLines: number;
    alreadyImported: number;
    checks: { label: string; ok: boolean; detail?: string }[];
    /** True when a check failed — confirming is refused. */
    blocked: boolean;
    /** This account has never been imported before; confirming needs `confirmNewAccount`. */
    newAccount: boolean;
}

// ---------------------------------------------------------------------------
// Reading the file
// ---------------------------------------------------------------------------

async function readRows(file: UploadedStatement): Promise<unknown[][]> {
    const b = file.buffer;
    const isZip = b.length > 3 && b[0] === 0x50 && b[1] === 0x4b; // .xlsx
    const isOle = b.length > 7 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // legacy .xls

    if (isZip) {
        const ExcelJSMod = await import("exceljs");
        const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(b as unknown as ArrayBuffer);
        const ws = wb.worksheets[0];
        if (!ws) throw badRequest("The workbook has no sheets.");
        const rows: unknown[][] = [];
        ws.eachRow({ includeEmpty: true }, (row) => {
            const values: unknown[] = [];
            row.eachCell({ includeEmpty: true }, (cell, col) => { values[col - 1] = cell.text; });
            rows.push(values);
        });
        return rows;
    }

    if (isOle) {
        // HDFC NetBanking's default "XLS" is the 1997–2003 binary format,
        // which ExcelJS cannot read. SheetJS can; it is loaded only if it is
        // installed (see the install note in the reply / README), so the
        // build never depends on it.
        const moduleName = "xlsx";
        let XLSX: { read: (data: Buffer, o: object) => { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_json: (ws: unknown, o: object) => unknown[][] } };
        try {
            XLSX = (await import(moduleName)) as typeof XLSX;
        } catch {
            throw badRequest(
                "This is HDFC's older .xls format, which the server cannot read yet. "
                + "Download the statement again choosing \"Delimited\" or Excel (.xlsx), or open it in Excel and Save As .xlsx.",
            );
        }
        const wb = XLSX.read(b, { type: "buffer" });
        return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    }

    return parseDelimited(b.toString("utf8"));
}

const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

function fingerprintOf(accountRef: string, l: ParsedBankStatement["lines"][number]): string {
    return sha256(`${accountRef}|${l.txnDate}|${l.reference ?? ""}|${l.deposit - l.withdrawal}|${l.balance}|${l.narration}`);
}

// ---------------------------------------------------------------------------
// Import: preview, then confirm
// ---------------------------------------------------------------------------

interface Prepared {
    parsed: ParsedBankStatement;
    fileHash: string;
    accountRef: string;
    fingerprints: string[];
    existing: Set<string>;
    preview: ImportPreview;
}

async function prepare(file: UploadedStatement): Promise<Prepared> {
    const rows = await readRows(file);
    let parsed: ParsedBankStatement;
    try {
        parsed = parseHdfcStatement(rows, file.originalname);
    } catch (err) {
        throw badRequest(err instanceof Error ? err.message : "The statement could not be read.");
    }
    const fileHash = sha256(file.buffer);
    const accountRef = parsed.accountRef ?? "UNKNOWN";

    const checks: ImportPreview["checks"] = [];
    const arithmetic = checkStatementArithmetic(parsed);
    checks.push({
        label: "Every balance follows from the one before, and totals match HDFC's summary",
        ok: arithmetic.length === 0,
        detail: arithmetic.slice(0, 3).join(" "),
    });

    const { data: sameFile, error: sameFileError } = await db
        .from("external_statements").select("id").eq("source", "hdfc").eq("external_ref", fileHash).maybeSingle();
    if (sameFileError) throw sameFileError;
    checks.push({ label: "This exact file has not been imported before", ok: !sameFile });

    const { data: accounts, error: accountsError } = await db
        .from("external_statements").select("account_ref").eq("source", "hdfc");
    if (accountsError) throw accountsError;
    const known = new Set(((accounts ?? []) as { account_ref: string | null }[]).map((a) => a.account_ref));
    const newAccount = known.size > 0 && !known.has(accountRef);
    checks.push({
        label: parsed.accountRef ? `Account ending ${parsed.accountRef}` : "Account number",
        ok: !!parsed.accountRef,
        detail: parsed.accountRef ? (newAccount ? "Not imported before — confirm it is a Swapngo account." : undefined)
            : "The account number could not be read from the file or its name.",
    });

    // No gap with the statement before it, for the same account.
    if (parsed.periodFrom && parsed.openingBalance != null) {
        const { data: previous, error: previousError } = await db
            .from("external_statements")
            .select("period_to, closing_balance")
            .eq("source", "hdfc").eq("account_ref", accountRef)
            .lt("period_to", parsed.periodFrom)
            .order("period_to", { ascending: false }).limit(1).maybeSingle();
        if (previousError) throw previousError;
        const prev = previous as { period_to: string; closing_balance: number | string | null } | null;
        if (prev && prev.closing_balance != null) {
            const contiguous = Math.abs(Number(prev.closing_balance) - parsed.openingBalance) <= 0.009;
            checks.push({
                label: "Opening balance equals the previous statement's closing balance",
                ok: contiguous,
                detail: contiguous ? undefined
                    : `The statement ending ${prev.period_to} closed at ${Number(prev.closing_balance).toFixed(2)}; this one opens at ${parsed.openingBalance.toFixed(2)}. Import the missing period first.`,
            });
        }
    }

    const fingerprints = parsed.lines.map((l) => fingerprintOf(accountRef, l));
    const existing = new Set<string>();
    for (let i = 0; i < fingerprints.length; i += 200) {
        const { data, error } = await db
            .from("external_statement_lines").select("fingerprint")
            .eq("source", "hdfc").in("fingerprint", fingerprints.slice(i, i + 200));
        if (error) throw error;
        for (const r of (data ?? []) as { fingerprint: string }[]) existing.add(r.fingerprint);
    }

    const credits = round2(parsed.lines.reduce((s, l) => s + l.deposit, 0));
    const debits = round2(parsed.lines.reduce((s, l) => s + l.withdrawal, 0));
    const preview: ImportPreview = {
        fileName: file.originalname,
        accountRef: parsed.accountRef,
        periodFrom: parsed.periodFrom,
        periodTo: parsed.periodTo,
        openingBalance: parsed.openingBalance,
        closingBalance: parsed.closingBalance,
        credits, debits,
        lineCount: parsed.lines.length,
        newLines: fingerprints.filter((f) => !existing.has(f)).length,
        alreadyImported: fingerprints.filter((f) => existing.has(f)).length,
        checks,
        blocked: checks.some((c) => !c.ok),
        newAccount,
    };
    return { parsed, fileHash, accountRef, fingerprints, existing, preview };
}

export async function previewBankStatement(file: UploadedStatement): Promise<ImportPreview> {
    return (await prepare(file)).preview;
}

export async function importBankStatement(
    file: UploadedStatement, opts: { confirmNewAccount: boolean }, actor: AuthContext,
): Promise<{ statementId: string; preview: ImportPreview; matched: number; exceptions: number }> {
    const p = await prepare(file);
    if (p.preview.blocked) throw businessRule("The statement did not pass its checks; nothing was imported.");
    if (p.preview.newAccount && !opts.confirmNewAccount) {
        throw businessRule("This account has not been imported before. Confirm it is a Swapngo account to continue.");
    }
    if (p.preview.newLines === 0) throw conflict("Every line in this statement has already been imported.");

    const path = `bank/${p.accountRef}/${p.fileHash}${file.originalname.match(/\.[a-z0-9]+$/i)?.[0] ?? ""}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, file.buffer, {
        contentType: file.mimetype || "application/octet-stream", upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: statement, error: statementError } = await db
        .from("external_statements")
        .insert({
            source: "hdfc",
            external_ref: p.fileHash,
            account_ref: p.accountRef,
            statement_date: p.parsed.periodTo ?? p.parsed.lines[p.parsed.lines.length - 1].txnDate,
            period_from: p.parsed.periodFrom,
            period_to: p.parsed.periodTo,
            gross_amount: p.preview.credits,
            net_amount: round2(p.preview.credits - p.preview.debits),
            opening_balance: p.parsed.openingBalance,
            closing_balance: p.parsed.closingBalance,
            line_count: p.preview.newLines,
            file_path: path,
            imported_by_user_id: actor.id,
            raw: { fileName: file.originalname, summary: p.parsed.summary },
        })
        .select("id")
        .single();
    if (statementError) throw statementError;

    const lines = p.parsed.lines
        .map((l, i) => ({ l, fingerprint: p.fingerprints[i], lineNo: i + 1 }))
        .filter((x) => !p.existing.has(x.fingerprint))
        .map(({ l, fingerprint, lineNo }) => {
            const kind = l.deposit > 0 ? "bank_credit" as const : "bank_debit" as const;
            const read = readNarration(l.narration, kind);
            return {
                statement_id: (statement as { id: string }).id,
                source: "hdfc",
                line_no: lineNo,
                external_id: l.reference,
                kind,
                occurred_at: new Date(`${l.txnDate}T00:00:00+05:30`).toISOString(),
                value_date: l.valueDate ?? l.txnDate,
                amount: kind === "bank_credit" ? l.deposit : -l.withdrawal,
                net_amount: kind === "bank_credit" ? l.deposit : -l.withdrawal,
                description: l.narration,
                running_balance: l.balance,
                counterparty_key: read.counterpartyKey,
                category: read.category,
                category_source: read.category ? "auto" : null,
                fingerprint,
            };
        });
    const { data: inserted, error: insertError } = await db
        .from("external_statement_lines").insert(lines).select("id");
    if (insertError) throw insertError;

    const result = await matchBankLines(((inserted ?? []) as { id: string }[]).map((r) => r.id));

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "settlement.bank_statement_imported",
        entityType: "external_statement", entityId: (statement as { id: string }).id,
        after: {
            account_ref: p.accountRef, period_from: p.parsed.periodFrom, period_to: p.parsed.periodTo,
            lines: lines.length, skipped: p.preview.alreadyImported, ...result,
        },
    });
    return { statementId: (statement as { id: string }).id, preview: p.preview, ...result };
}

// ---------------------------------------------------------------------------
// Matching and categories
// ---------------------------------------------------------------------------

interface BankLine {
    id: string; kind: "bank_credit" | "bank_debit"; amount: number; external_id: string | null;
    description: string | null; value_date: string; counterparty_key: string | null;
    category: string | null; category_source: string | null; match_status: string;
    payment_transaction_id: string | null; refund_id: string | null; matched_statement_id: string | null;
}

const dayShift = (day: string, days: number) => {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
};

/**
 * Decides one bank line: what it pays out or pays back, and whether that is
 * an exception. Lines a person already resolved are never touched.
 */
async function decideLine(line: BankLine): Promise<{ update: Record<string, unknown>; exception: boolean }> {
    let category = line.category;
    let categorySource = line.category_source;

    // A category learned from the same counterparty, when none is set yet.
    if (!category && line.counterparty_key) {
        const { data: learned } = await db
            .from("external_statement_lines")
            .select("category")
            .eq("source", "hdfc").eq("kind", line.kind).eq("counterparty_key", line.counterparty_key)
            .not("category", "is", null).neq("id", line.id)
            .in("category_source", ["manual", "learned"])
            .order("updated_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
        if (learned) {
            category = (learned as { category: string }).category;
            categorySource = "learned";
        }
    }

    const update: Record<string, unknown> = { category, category_source: categorySource };
    let exception: string | null = null;

    if (category === "razorpay_settlement" && line.kind === "bank_credit") {
        const candidates = utrCandidates(line.external_id, line.description ?? "");
        const { data: settlement } = candidates.length
            ? await db.from("external_statements").select("id, net_amount")
                .eq("source", "razorpay").in("utr", candidates).limit(1).maybeSingle()
            : { data: null };
        const s = settlement as { id: string; net_amount: number | string } | null;
        if (!s) exception = "B2";
        else {
            update.matched_statement_id = s.id;
            if (Math.abs(Number(s.net_amount) - line.amount) > 0.009) exception = "B3";
        }
    } else if (line.kind === "bank_credit" && (category === "rider_payment_direct" || !category)) {
        // A direct rider payment: the offline (manual_) UPI / netbanking
        // payment staff recorded, same amount, within two days.
        const { data: txns } = await db
            .from("payment_transactions")
            .select("id, captured_at")
            .eq("status", "succeeded").like("gateway_payment_id", "manual_%")
            .in("method", ["upi", "netbanking"])
            .eq("amount", line.amount)
            .gte("captured_at", `${dayShift(line.value_date, -2)}T00:00:00+05:30`)
            .lt("captured_at", `${dayShift(line.value_date, 3)}T00:00:00+05:30`)
            .order("captured_at");
        const taken = await linkedIds("payment_transaction_id", ((txns ?? []) as { id: string }[]).map((t) => t.id));
        const free = ((txns ?? []) as { id: string }[]).find((t) => !taken.has(t.id) || line.payment_transaction_id === t.id);
        if (free) {
            update.payment_transaction_id = free.id;
            if (!category) { category = "rider_payment_direct"; update.category = category; update.category_source = "auto"; }
        } else if (category === "rider_payment_direct") {
            exception = "B9";
        }
    } else if (line.kind === "bank_debit" && (category === "rider_refund" || !category)) {
        // Money back to a rider by transfer: an offline refund, same amount, within three days.
        const { data: refunds } = await db
            .from("refunds")
            .select("id, completed_at")
            .eq("status", "succeeded").like("gateway_refund_id", "manual_refund_%")
            .eq("amount", -line.amount)
            .gte("completed_at", `${dayShift(line.value_date, -3)}T00:00:00+05:30`)
            .lt("completed_at", `${dayShift(line.value_date, 4)}T00:00:00+05:30`)
            .order("completed_at");
        const taken = await linkedIds("refund_id", ((refunds ?? []) as { id: string }[]).map((r) => r.id));
        const free = ((refunds ?? []) as { id: string }[]).find((r) => !taken.has(r.id) || line.refund_id === r.id);
        if (free) {
            update.refund_id = free.id;
            if (!category) { category = "rider_refund"; update.category = category; update.category_source = "auto"; }
            const { error } = await supabaseAdmin.from("refunds").update({ paid_by: "bank_transfer" }).eq("id", free.id);
            if (error) throw error;
        } else if (category === "rider_refund") {
            exception = "B10";
        }
    }

    update.exception_code = exception;
    update.match_status = exception ? "exception" : category ? "matched" : "unmatched";
    return { update, exception: !!exception };
}

async function linkedIds(column: "payment_transaction_id" | "refund_id", ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const { data, error } = await db.from("external_statement_lines").select(column).in(column, ids);
    if (error) throw error;
    return new Set(((data ?? []) as Record<string, string>[]).map((r) => r[column]));
}

const BANK_LINE_FIELDS = "id, kind, amount, external_id, description, value_date, counterparty_key, category, category_source, match_status, payment_transaction_id, refund_id, matched_statement_id";

async function matchBankLines(lineIds: string[]): Promise<{ matched: number; exceptions: number }> {
    let matched = 0;
    let exceptions = 0;
    for (let i = 0; i < lineIds.length; i += 200) {
        const { data, error } = await db
            .from("external_statement_lines").select(BANK_LINE_FIELDS)
            .in("id", lineIds.slice(i, i + 200))
            .in("match_status", ["unmatched", "matched", "exception"]);
        if (error) throw error;
        for (const raw of (data ?? []) as (Omit<BankLine, "amount"> & { amount: number | string })[]) {
            const line = { ...raw, amount: Number(raw.amount) } as BankLine;
            // eslint-disable-next-line no-await-in-loop -- each decision reads what the previous one linked
            const { update, exception } = await decideLine(line);
            // eslint-disable-next-line no-await-in-loop
            const { error: updateError } = await db.from("external_statement_lines").update(update).eq("id", line.id);
            if (updateError) throw updateError;
            if (exception) exceptions++;
            else if (update.match_status === "matched") matched++;
        }
    }
    return { matched, exceptions };
}

/** Re-matches every open bank line — after a Razorpay sync fills in settlements, B2s clear themselves. */
export async function rematchOpenBankLines(): Promise<{ matched: number; exceptions: number }> {
    const { data, error } = await db
        .from("external_statement_lines").select("id")
        .eq("source", "hdfc").in("match_status", ["unmatched", "exception"]).limit(2000);
    if (error) throw error;
    return matchBankLines(((data ?? []) as { id: string }[]).map((r) => r.id));
}

export async function categoriseLine(
    lineId: string, input: { category: string; applyToCounterparty: boolean }, actor: AuthContext,
): Promise<{ updated: number }> {
    if (!ALL_CATEGORIES.has(input.category)) throw badRequest("Unknown category.");
    const { data: line, error } = await db
        .from("external_statement_lines")
        .select("id, source, kind, counterparty_key, category, match_status")
        .eq("id", lineId).maybeSingle();
    if (error) throw error;
    const l = line as { source: string; kind: string; counterparty_key: string | null; category: string | null; match_status: string } | null;
    if (!l || l.source !== "hdfc") throw notFound("Bank line not found.");
    const inList = (l.kind === "bank_credit" ? MONEY_IN_CATEGORIES : MONEY_OUT_CATEGORIES) as string[];
    if (!inList.includes(input.category)) {
        throw badRequest(l.kind === "bank_credit" ? "That category is for money going out." : "That category is for money coming in.");
    }
    if (l.match_status === "resolved" || l.match_status === "ignored") {
        throw businessRule("This line's exception was resolved; its category is fixed with it.");
    }

    const { error: updateError } = await db
        .from("external_statement_lines")
        .update({ category: input.category, category_source: "manual", match_status: "unmatched", exception_code: null })
        .eq("id", lineId);
    if (updateError) throw updateError;
    const touched = [lineId];

    if (input.applyToCounterparty && l.counterparty_key) {
        const { data: others, error: othersError } = await db
            .from("external_statement_lines")
            .update({ category: input.category, category_source: "learned" })
            .eq("source", "hdfc").eq("kind", l.kind).eq("counterparty_key", l.counterparty_key)
            .is("category", null).neq("id", lineId)
            .select("id");
        if (othersError) throw othersError;
        touched.push(...((others ?? []) as { id: string }[]).map((o) => o.id));
    }
    await matchBankLines(touched);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "settlement.bank_line_categorised",
        entityType: "external_statement_line", entityId: lineId,
        before: { category: l.category },
        after: { category: input.category, also_applied_to: touched.length - 1, counterparty: l.counterparty_key },
    });
    return { updated: touched.length };
}

export async function listBankLines(f: {
    from: string; to: string; filter: "all" | "uncategorised" | "exceptions"; category?: string;
    search?: string; page: number; pageSize: number;
}): Promise<Paginated<StatementLineRow>> {
    let q = db.from("external_statement_lines").select(LINE_COLUMNS, { count: "exact" })
        .eq("source", "hdfc").gte("value_date", f.from).lte("value_date", f.to);
    if (f.filter === "uncategorised") q = q.is("category", null);
    if (f.filter === "exceptions") q = q.eq("match_status", "exception");
    if (f.category) q = q.eq("category", f.category);
    if (f.search) {
        const s = f.search.replace(/[,()*%\\]/g, " ").trim();
        if (s) q = q.or(`description.ilike.%${s}%,external_id.ilike.%${s}%,counterparty_key.ilike.%${s}%`);
    }
    const [from, to] = toRange(f);
    const { data, error, count } = await q.order("value_date", { ascending: false }).order("line_no", { ascending: false }).range(from, to);
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawLine[]).map(toLineRow), count ?? 0, f);
}

// ---------------------------------------------------------------------------
// Cash book — hub cash collected, spent on expenses, and deposited in the bank
// ---------------------------------------------------------------------------

export interface CashBookDay { date: string; collected: number; spent: number; deposited: number; inHand: number }

export async function getCashBook(month: string): Promise<{ month: string; openingInHand: number; days: CashBookDay[]; inHand: number; oldestUndepositedDays: number }> {
    const { from, to } = monthBounds(month);
    const [cashIn, deposits, spentCash] = await Promise.all([
        db.from("payment_transactions").select("amount, captured_at")
            .eq("status", "succeeded").eq("method", "cash").like("gateway_payment_id", "manual_%")
            .lt("captured_at", `${dayShift(to, 1)}T00:00:00+05:30`),
        db.from("external_statement_lines").select("amount, value_date")
            .eq("source", "hdfc").eq("category", "cash_deposit").lte("value_date", to),
        // Expenses paid from cash in hand (purchases.service createExpense / setBillPaymentMethod).
        db.from("purchase_bills").select("total_amount, paid_on, bill_date")
            .eq("status", "confirmed").eq("paid_via", "cash").lte("bill_date", to),
    ]);
    if (cashIn.error) throw cashIn.error;
    if (deposits.error) throw deposits.error;
    if (spentCash.error) throw spentCash.error;

    const istDay = (ts: string) => new Date(new Date(ts).getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
    const collectedBy = new Map<string, number>();
    const depositedBy = new Map<string, number>();
    const spentBy = new Map<string, number>();
    let opening = 0;
    for (const r of (cashIn.data ?? []) as { amount: number | string; captured_at: string }[]) {
        const d = istDay(r.captured_at);
        if (d < from) opening += Number(r.amount);
        else collectedBy.set(d, (collectedBy.get(d) ?? 0) + Number(r.amount));
    }
    for (const r of (deposits.data ?? []) as { amount: number | string; value_date: string }[]) {
        if (r.value_date < from) opening -= Number(r.amount);
        else depositedBy.set(r.value_date, (depositedBy.get(r.value_date) ?? 0) + Number(r.amount));
    }

    for (const r of (spentCash.data ?? []) as { total_amount: number | string; paid_on: string | null; bill_date: string }[]) {
        const d = r.paid_on ?? r.bill_date;
        if (d > to) continue;
        if (d < from) opening -= Number(r.total_amount);
        else spentBy.set(d, (spentBy.get(d) ?? 0) + Number(r.total_amount));
    }

    const days: CashBookDay[] = [];
    let inHand = round2(opening);
    let undepositedSince: string | null = inHand > 0.009 ? from : null;
    for (let d = from; d <= to; d = dayShift(d, 1)) {
        const collected = round2(collectedBy.get(d) ?? 0);
        const deposited = round2(depositedBy.get(d) ?? 0);
        const spent = round2(spentBy.get(d) ?? 0);
        if (collected === 0 && deposited === 0 && spent === 0) continue;
        inHand = round2(inHand + collected - spent - deposited);
        if (inHand <= 0.009) undepositedSince = null;
        else if (!undepositedSince) undepositedSince = d;
        days.push({ date: d, collected, spent, deposited, inHand });
    }
    const end = to < new Date().toISOString().slice(0, 10) ? to : new Date().toISOString().slice(0, 10);
    const oldest = undepositedSince
        ? Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${undepositedSince}T00:00:00Z`).getTime()) / 86_400_000)
        : 0;
    return { month, openingInHand: round2(opening), days, inHand, oldestUndepositedDays: oldest };
}

// ---------------------------------------------------------------------------
// Tie-out — what Razorpay paid out against what HDFC received
// ---------------------------------------------------------------------------

export interface TieOut {
    month: string;
    settledByRazorpay: number;
    settlementCount: number;
    receivedInBank: number;
    receivedCount: number;
    difference: number;
    /** Settlements not found in any imported bank statement (B1). */
    notReceived: { statementId: string; settlementId: string; utr: string | null; date: string; amount: number }[];
    /** Bank coverage: the last date any HDFC statement covers. */
    bankCoveredUntil: string | null;
    uncategorisedLines: number;
    openBankExceptions: number;
}

export async function getTieOut(month: string): Promise<TieOut> {
    const { from, to } = monthBounds(month);
    const [settlements, received, coverage, uncategorised, exceptions] = await Promise.all([
        db.from("external_statements").select("id, external_ref, utr, statement_date, net_amount")
            .eq("source", "razorpay").gte("statement_date", from).lte("statement_date", to),
        db.from("external_statement_lines").select("amount, matched_statement_id")
            .eq("source", "hdfc").eq("category", "razorpay_settlement").gte("value_date", from).lte("value_date", to),
        db.from("external_statements").select("period_to").eq("source", "hdfc")
            .order("period_to", { ascending: false }).limit(1).maybeSingle(),
        db.from("external_statement_lines").select("id", { count: "exact", head: true })
            .eq("source", "hdfc").is("category", null).gte("value_date", from).lte("value_date", to),
        db.from("external_statement_lines").select("id", { count: "exact", head: true })
            .eq("source", "hdfc").eq("match_status", "exception"),
    ]);
    for (const r of [settlements, received, coverage, uncategorised, exceptions]) if (r.error) throw r.error;

    const s = (settlements.data ?? []) as { id: string; external_ref: string; utr: string | null; statement_date: string; net_amount: number | string }[];
    const r = (received.data ?? []) as { amount: number | string; matched_statement_id: string | null }[];
    const covered = (coverage.data as { period_to: string | null } | null)?.period_to ?? null;

    const { data: anyMatch, error: anyMatchError } = s.length
        ? await db.from("external_statement_lines").select("matched_statement_id").in("matched_statement_id", s.map((x) => x.id))
        : { data: [], error: null };
    if (anyMatchError) throw anyMatchError;
    const matchedIds = new Set(((anyMatch ?? []) as { matched_statement_id: string }[]).map((m) => m.matched_statement_id));

    const settled = round2(s.reduce((t, x) => t + Number(x.net_amount), 0));
    const inBank = round2(r.reduce((t, x) => t + Number(x.amount), 0));
    return {
        month,
        settledByRazorpay: settled,
        settlementCount: s.length,
        receivedInBank: inBank,
        receivedCount: r.length,
        difference: round2(settled - inBank),
        notReceived: s
            .filter((x) => Number(x.net_amount) > 0 && !matchedIds.has(x.id) && !!covered && dayShift(x.statement_date, 2) <= covered)
            .map((x) => ({ statementId: x.id, settlementId: x.external_ref, utr: x.utr, date: x.statement_date, amount: Number(x.net_amount) })),
        bankCoveredUntil: covered,
        uncategorisedLines: uncategorised.count ?? 0,
        openBankExceptions: exceptions.count ?? 0,
    };
}
