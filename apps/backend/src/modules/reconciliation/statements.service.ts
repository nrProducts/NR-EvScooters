import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { badRequest, businessRule, notFound, serviceUnavailable } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { paginate, toRange } from "../../common/pagination";
import type { AuthContext, Paginated } from "../../types";
import { recoverOrderPaymentAsStaff } from "../payments/payments.service";
import type {
    ExceptionRow, SettlementMonthSummary, StatementDetail, StatementLineRow, StatementRow, StatementSource,
} from "./statements.types";

/**
 * Stage 2 — Razorpay settlements, stored line by line and matched to our own
 * payments and refunds (supabase/migrations/20261103120000_external_statements.sql).
 * The razorpay-settlement-sync edge function writes the statements; this is
 * where they are read, summarised, exported and where exceptions get resolved.
 *
 * The statement tables are not in the generated types yet, hence the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

const round2 = (n: number) => Math.round(n * 100) / 100;
const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;

/** IST calendar day → the instant it starts, for timestamp range filters. */
const istStart = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString();
function nextDay(day: string): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
}
export function monthBounds(month: string): { from: string; to: string } {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

const STATEMENT_COLUMNS = `id, source, external_ref, account_ref, utr, statement_date, period_from, period_to,
    gross_amount, refund_amount, fee_amount, tax_amount, net_amount, opening_balance, closing_balance,
    line_count, status, status_note, synced_at`;

interface RawStatement {
    id: string; source: StatementSource; external_ref: string; account_ref: string | null; utr: string | null;
    statement_date: string; period_from: string | null; period_to: string | null;
    gross_amount: number | string; refund_amount: number | string; fee_amount: number | string;
    tax_amount: number | string; net_amount: number | string;
    opening_balance: number | string | null; closing_balance: number | string | null;
    line_count: number; status: "balanced" | "exceptions"; status_note: string | null; synced_at: string;
}

function toStatementRow(r: RawStatement, openExceptions: number, bankMatched: boolean): StatementRow {
    const num = (v: number | string | null) => (v == null ? null : Number(v));
    return {
        id: r.id, source: r.source, externalRef: r.external_ref, accountRef: r.account_ref, utr: r.utr,
        statementDate: r.statement_date, periodFrom: r.period_from, periodTo: r.period_to,
        grossAmount: Number(r.gross_amount), refundAmount: Number(r.refund_amount),
        feeAmount: Number(r.fee_amount), taxAmount: Number(r.tax_amount), netAmount: Number(r.net_amount),
        openingBalance: num(r.opening_balance), closingBalance: num(r.closing_balance),
        lineCount: r.line_count, openExceptions, status: r.status, statusNote: r.status_note,
        bankMatched, syncedAt: r.synced_at,
    };
}

export const LINE_COLUMNS = `id, statement_id, source, line_no, external_id, kind, occurred_at, value_date, amount,
    net_amount, fee, tax, method, gateway_order_id, description, running_balance, counterparty_key, category,
    category_source, match_status, exception_code, payment_transaction_id, refund_id, matched_statement_id,
    resolved_at, resolved_note,
    payment_transactions(payment_orders(user_id, users(full_name), invoices(invoice_number))),
    refunds(user_id, users!refunds_user_id_fkey(full_name))`;

export interface RawLine {
    id: string; statement_id: string; source: StatementSource; line_no: number; external_id: string | null;
    kind: StatementLineRow["kind"]; occurred_at: string | null; value_date: string | null;
    amount: number | string; net_amount: number | string; fee: number | string; tax: number | string;
    method: string | null; gateway_order_id: string | null; description: string | null;
    running_balance: number | string | null; counterparty_key: string | null; category: string | null;
    category_source: StatementLineRow["categorySource"]; match_status: StatementLineRow["matchStatus"];
    exception_code: string | null; payment_transaction_id: string | null; refund_id: string | null;
    matched_statement_id: string | null; resolved_at: string | null; resolved_note: string | null;
    payment_transactions: unknown; refunds: unknown;
}

export function toLineRow(r: RawLine): StatementLineRow {
    const txn = one(r.payment_transactions as { payment_orders: unknown } | null);
    const order = one(txn?.payment_orders as { user_id: string; users: unknown; invoices: unknown } | null);
    const refund = one(r.refunds as { user_id: string; users: unknown } | null);
    const rider = one((order?.users ?? refund?.users) as { full_name: string } | null);
    return {
        id: r.id, statementId: r.statement_id, source: r.source, lineNo: r.line_no, externalId: r.external_id,
        kind: r.kind, occurredAt: r.occurred_at, valueDate: r.value_date,
        amount: Number(r.amount), netAmount: Number(r.net_amount), fee: Number(r.fee), tax: Number(r.tax),
        method: r.method, gatewayOrderId: r.gateway_order_id, description: r.description,
        runningBalance: r.running_balance == null ? null : Number(r.running_balance),
        counterpartyKey: r.counterparty_key, category: r.category, categorySource: r.category_source,
        matchStatus: r.match_status, exceptionCode: r.exception_code,
        paymentTransactionId: r.payment_transaction_id, refundId: r.refund_id,
        matchedStatementId: r.matched_statement_id,
        riderId: order?.user_id ?? refund?.user_id ?? null,
        riderName: rider?.full_name ?? null,
        billNumber: one(order?.invoices as { invoice_number: string } | null)?.invoice_number ?? null,
        resolvedAt: r.resolved_at, resolvedNote: r.resolved_note,
    };
}

async function openExceptionCounts(statementIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (statementIds.length === 0) return counts;
    const { data, error } = await db
        .from("external_statement_lines")
        .select("statement_id")
        .in("statement_id", statementIds)
        .eq("match_status", "exception");
    if (error) throw error;
    for (const r of (data ?? []) as { statement_id: string }[]) {
        counts.set(r.statement_id, (counts.get(r.statement_id) ?? 0) + 1);
    }
    return counts;
}

async function bankMatchedIds(statementIds: string[]): Promise<Set<string>> {
    if (statementIds.length === 0) return new Set();
    const { data, error } = await db
        .from("external_statement_lines")
        .select("matched_statement_id")
        .in("matched_statement_id", statementIds);
    if (error) throw error;
    return new Set(((data ?? []) as { matched_statement_id: string }[]).map((r) => r.matched_statement_id));
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

export async function listStatements(f: {
    source: StatementSource; from: string; to: string; page: number; pageSize: number;
}): Promise<Paginated<StatementRow>> {
    const [from, to] = toRange(f);
    const { data, error, count } = await db
        .from("external_statements")
        .select(STATEMENT_COLUMNS, { count: "exact" })
        .eq("source", f.source)
        .gte("statement_date", f.from)
        .lte("statement_date", f.to)
        .order("statement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as RawStatement[];
    const ids = rows.map((r) => r.id);
    const [counts, matched] = await Promise.all([openExceptionCounts(ids), bankMatchedIds(ids)]);
    return paginate(rows.map((r) => toStatementRow(r, counts.get(r.id) ?? 0, matched.has(r.id))), count ?? 0, f);
}

export async function getStatement(id: string): Promise<StatementDetail> {
    const { data, error } = await db.from("external_statements").select(STATEMENT_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Statement not found.");

    const lines: RawLine[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data: batch, error: linesError } = await db
            .from("external_statement_lines")
            .select(LINE_COLUMNS)
            .eq("statement_id", id)
            .order("line_no")
            .range(offset, offset + 999);
        if (linesError) throw linesError;
        lines.push(...((batch ?? []) as unknown as RawLine[]));
        if ((batch ?? []).length < 1000) break;
    }
    const [counts, matched] = await Promise.all([openExceptionCounts([id]), bankMatchedIds([id])]);
    return { ...toStatementRow(data as RawStatement, counts.get(id) ?? 0, matched.has(id)), lines: lines.map(toLineRow) };
}

// ---------------------------------------------------------------------------
// Month summary — the Razorpay half of the tie-out
// ---------------------------------------------------------------------------

export async function getSettlementMonthSummary(month: string): Promise<SettlementMonthSummary> {
    const { from, to } = monthBounds(month);
    const startTs = istStart(from);
    const endTs = istStart(nextDay(to));

    const [captured, refunded, statements, first, exceptions, unsettled] = await Promise.all([
        db.from("payment_transactions").select("amount")
            .eq("status", "succeeded").like("gateway_payment_id", "pay_%")
            .gte("captured_at", startTs).lt("captured_at", endTs),
        db.from("refunds").select("amount")
            .eq("status", "succeeded").eq("paid_by", "gateway")
            .gte("completed_at", startTs).lt("completed_at", endTs),
        db.from("external_statements").select("fee_amount, tax_amount, net_amount")
            .eq("source", "razorpay").gte("statement_date", from).lte("statement_date", to),
        db.from("external_statements").select("statement_date")
            .eq("source", "razorpay").order("statement_date").limit(1).maybeSingle(),
        db.from("external_statement_lines").select("id", { count: "exact", head: true })
            .eq("source", "razorpay").eq("match_status", "exception"),
        db.from("v_razorpay_unsettled").select("payment_transaction_id", { count: "exact", head: true }),
    ]);
    for (const r of [captured, refunded, statements, first, exceptions, unsettled]) if (r.error) throw r.error;

    const sum = (rows: unknown, key: string) =>
        round2(((rows ?? []) as Record<string, number | string>[]).reduce((s, r) => s + Number(r[key]), 0));

    // In transit at month-end: captured by then, but in no settlement dated by
    // then. Payments settle T+2, so the last three weeks covers everything.
    const lookback = new Date(new Date(endTs).getTime() - 21 * 86_400_000).toISOString();
    const { data: recent, error: recentError } = await db
        .from("payment_transactions").select("gateway_payment_id, amount")
        .eq("status", "succeeded").like("gateway_payment_id", "pay_%")
        .gte("captured_at", lookback).lt("captured_at", endTs);
    if (recentError) throw recentError;
    const recentRows = (recent ?? []) as { gateway_payment_id: string; amount: number | string }[];

    const settledBy = new Map<string, string>();
    for (let i = 0; i < recentRows.length; i += 200) {
        const ids = recentRows.slice(i, i + 200).map((r) => r.gateway_payment_id);
        const { data: lines, error: linesError } = await db
            .from("external_statement_lines")
            .select("external_id, external_statements!external_statement_lines_statement_id_fkey(statement_date)")
            .eq("source", "razorpay").eq("kind", "payment").in("external_id", ids);
        if (linesError) throw linesError;
        for (const l of (lines ?? []) as { external_id: string; external_statements: unknown }[]) {
            const date = one(l.external_statements as { statement_date: string } | null)?.statement_date;
            if (date) settledBy.set(l.external_id, date);
        }
    }
    const inTransit = recentRows.filter((r) => {
        const date = settledBy.get(r.gateway_payment_id);
        return !date || date > to;
    });

    return {
        month, from, to,
        captured: sum(captured.data, "amount"),
        capturedCount: (captured.data ?? []).length,
        refunded: sum(refunded.data, "amount"),
        fees: round2(sum(statements.data, "fee_amount") - sum(statements.data, "tax_amount")),
        feeGst: sum(statements.data, "tax_amount"),
        settled: sum(statements.data, "net_amount"),
        settlementCount: (statements.data ?? []).length,
        inTransitAtEnd: round2(inTransit.reduce((s, r) => s + Number(r.amount), 0)),
        inTransitCount: inTransit.length,
        openExceptions: (exceptions.count ?? 0) + (unsettled.count ?? 0),
        syncedSince: (first.data as { statement_date: string } | null)?.statement_date ?? null,
    };
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export async function listExceptions(f: {
    status: "open" | "resolved"; code?: string; source?: StatementSource;
}): Promise<ExceptionRow[]> {
    let lineQuery = db
        .from("external_statement_lines")
        .select(LINE_COLUMNS)
        .order("occurred_at", { ascending: false })
        .limit(500);
    lineQuery = f.status === "open"
        ? lineQuery.eq("match_status", "exception")
        : lineQuery.in("match_status", ["resolved", "ignored"]).not("exception_code", "is", null);
    if (f.code) lineQuery = lineQuery.eq("exception_code", f.code);
    if (f.source) lineQuery = lineQuery.eq("source", f.source);
    const { data: lineData, error: lineError } = await lineQuery;
    if (lineError) throw lineError;

    const rows: ExceptionRow[] = ((lineData ?? []) as unknown as RawLine[]).map(toLineRow).map((l) => ({
        id: l.id, code: l.exceptionCode ?? "", kind: "line" as const, lineId: l.id, statementId: l.statementId,
        externalId: l.externalId, amount: l.amount, occurredAt: l.occurredAt,
        riderId: l.riderId, riderName: l.riderName, gatewayOrderId: l.gatewayOrderId,
        description: l.description, status: l.matchStatus, resolvedAt: l.resolvedAt, resolvedNote: l.resolvedNote,
    }));

    if (f.status === "open" && (!f.source || f.source === "razorpay") && (!f.code || f.code === "E2" || f.code === "E3")) {
        let unsettledQuery = db.from("v_razorpay_unsettled").select("*").order("occurred_at", { ascending: false }).limit(500);
        if (f.code) unsettledQuery = unsettledQuery.eq("exception_code", f.code);
        const { data: unsettled, error: unsettledError } = await unsettledQuery;
        if (unsettledError) throw unsettledError;
        const list = (unsettled ?? []) as {
            exception_code: string; payment_transaction_id: string | null; refund_id: string | null;
            external_id: string; amount: number | string; occurred_at: string | null; user_id: string;
        }[];
        const names = await riderNames(list.map((u) => u.user_id));
        for (const u of list) {
            rows.push({
                id: u.payment_transaction_id ?? u.refund_id ?? u.external_id,
                code: u.exception_code, kind: "unsettled", lineId: null, statementId: null,
                externalId: u.external_id, amount: Number(u.amount), occurredAt: u.occurred_at,
                riderId: u.user_id, riderName: names.get(u.user_id) ?? null, gatewayOrderId: null,
                description: u.exception_code === "E2"
                    ? "Captured more than 3 days ago and in no Razorpay settlement yet."
                    : "Refund recorded as paid, but Razorpay has not deducted it in any settlement.",
                status: "open", resolvedAt: null, resolvedNote: null,
            });
        }
    }
    return rows.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
}

async function riderNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const { data, error } = await supabaseAdmin.from("users").select("id, full_name").in("id", unique);
    if (error) throw error;
    return new Map((data ?? []).map((u) => [u.id, u.full_name]));
}

export async function resolveException(
    lineId: string, input: { action: "resolve" | "ignore"; note: string }, actor: AuthContext,
): Promise<StatementLineRow> {
    const { data: line, error } = await db
        .from("external_statement_lines")
        .select("id, match_status, exception_code")
        .eq("id", lineId)
        .maybeSingle();
    if (error) throw error;
    if (!line) throw notFound("Statement line not found.");
    if ((line as { match_status: string }).match_status !== "exception") {
        throw businessRule("This line has no open exception.");
    }

    const { error: updateError } = await db
        .from("external_statement_lines")
        .update({
            match_status: input.action === "ignore" ? "ignored" : "resolved",
            resolved_by_user_id: actor.id,
            resolved_at: new Date().toISOString(),
            resolved_note: input.note,
        })
        .eq("id", lineId)
        .eq("match_status", "exception");
    if (updateError) throw updateError;

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "settlement.exception_resolved",
        entityType: "external_statement_line", entityId: lineId,
        before: { match_status: "exception", exception_code: (line as { exception_code: string | null }).exception_code },
        after: { match_status: input.action === "ignore" ? "ignored" : "resolved", note: input.note },
    });

    const { data: fresh, error: freshError } = await db
        .from("external_statement_lines").select(LINE_COLUMNS).eq("id", lineId).single();
    if (freshError) throw freshError;
    return toLineRow(fresh as unknown as RawLine);
}

/**
 * E1 — Razorpay settled a payment our records never applied (the late-UPI
 * case, or a webhook that never arrived). Applies it through the same
 * gateway-verified path the rider app's own sync uses, which also issues its
 * GST tax invoice, then re-runs matching so the line clears itself.
 */
export async function recoverPayment(lineId: string, actor: AuthContext): Promise<{ status: string }> {
    const { data: line, error } = await db
        .from("external_statement_lines")
        .select("id, kind, match_status, exception_code, gateway_order_id")
        .eq("id", lineId)
        .maybeSingle();
    if (error) throw error;
    const l = line as { kind: string; match_status: string; exception_code: string | null; gateway_order_id: string | null } | null;
    if (!l) throw notFound("Statement line not found.");
    if (l.kind !== "payment" || l.exception_code !== "E1" || l.match_status !== "exception") {
        throw businessRule("Only an open E1 payment line can be recovered.");
    }
    if (!l.gateway_order_id) {
        throw businessRule("Razorpay reported no order for this payment, so it cannot be matched to a rider. Resolve it with a note instead.");
    }

    const result = await recoverOrderPaymentAsStaff(l.gateway_order_id, actor);
    const { error: matchError } = await db.rpc("match_razorpay_statement_lines");
    if (matchError) throw matchError;
    return result;
}

// ---------------------------------------------------------------------------
// Sync now
// ---------------------------------------------------------------------------

export async function syncRazorpaySettlements(
    range: { from: string; to: string }, actor: AuthContext,
): Promise<{ from: string; to: string; settlements: number; linesAdded: number; linesMatched: number }> {
    const { data, error } = await supabaseAdmin.functions.invoke("razorpay-settlement-sync", { body: range });
    if (error) {
        // The function answers 4xx/5xx with { error }; surface its words, not "non-2xx".
        let message = error.message;
        const context = (error as { context?: Response }).context;
        if (context && typeof context.json === "function") {
            const body = await context.json().catch(() => null) as { error?: string } | null;
            if (body?.error) message = body.error;
        }
        if (/gateway not configured/i.test(message)) throw serviceUnavailable("Razorpay is not configured for the sync function.");
        throw badRequest(`Razorpay sync failed: ${message}`);
    }
    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "settlement.sync_run",
        entityType: "external_statement", entityId: `${range.from}..${range.to}`, after: data as Record<string, unknown>,
    });
    return data as { from: string; to: string; settlements: number; linesAdded: number; linesMatched: number };
}

// ---------------------------------------------------------------------------
// Export — "the online sales report" in Taxkey's monthly request
// ---------------------------------------------------------------------------

export async function buildSettlementExport(month: string): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const { from, to } = monthBounds(month);
    const summary = await getSettlementMonthSummary(month);

    const statements: RawStatement[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("external_statements").select(STATEMENT_COLUMNS)
            .eq("source", "razorpay").gte("statement_date", from).lte("statement_date", to)
            .order("statement_date").range(offset, offset + 999);
        if (error) throw error;
        statements.push(...((data ?? []) as RawStatement[]));
        if ((data ?? []).length < 1000) break;
    }
    const lines: StatementLineRow[] = [];
    for (let i = 0; i < statements.length; i += 50) {
        const ids = statements.slice(i, i + 50).map((s) => s.id);
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await db.from("external_statement_lines").select(LINE_COLUMNS)
                .in("statement_id", ids).order("statement_id").order("line_no").range(offset, offset + 999);
            if (error) throw error;
            lines.push(...((data ?? []) as unknown as RawLine[]).map(toLineRow));
            if ((data ?? []).length < 1000) break;
        }
    }
    const byId = new Map(statements.map((s) => [s.id, s]));
    const exceptions = await listExceptions({ status: "open", source: "razorpay" });

    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SwapNgo";
    const MONEY = "#,##0.00";

    const s = wb.addWorksheet("Summary");
    s.columns = [{ width: 46 }, { width: 18 }];
    s.addRow([`Razorpay statement · ${from} to ${to}`]).font = { bold: true, size: 13 };
    s.addRow([]);
    const pairs: [string, number | string][] = [
        ["Payments captured (gross)", summary.captured],
        ["Refunds paid out", summary.refunded],
        ["Razorpay fees (excl. GST)", summary.fees],
        ["GST on fees (input tax credit)", summary.feeGst],
        ["Settled to bank", summary.settled],
        ["Settlements", summary.settlementCount],
        ["In transit at month-end (captured, not yet settled)", summary.inTransitAtEnd],
        ["Open exceptions", summary.openExceptions],
    ];
    for (const [k, v] of pairs) {
        const row = s.addRow([k, v]);
        if (typeof v === "number" && !/Settlements|exceptions/.test(k)) row.getCell(2).numFmt = MONEY;
    }

    const st = wb.addWorksheet("Settlements");
    st.columns = [
        { header: "Date", width: 12 }, { header: "Settlement", width: 22 }, { header: "UTR", width: 24 },
        { header: "Payments", width: 14 }, { header: "Refunds", width: 12 }, { header: "Fee incl. GST", width: 14 },
        { header: "GST on fee", width: 12 }, { header: "Settled", width: 14 }, { header: "Status", width: 14 },
    ];
    st.getRow(1).font = { bold: true };
    for (const r of statements) {
        st.addRow([r.statement_date, r.external_ref, r.utr ?? "", Number(r.gross_amount), Number(r.refund_amount),
            Number(r.fee_amount), Number(r.tax_amount), Number(r.net_amount), r.status]);
    }
    for (const c of [4, 5, 6, 7, 8]) st.getColumn(c).numFmt = MONEY;

    const ln = wb.addWorksheet("Lines");
    ln.columns = [
        { header: "Settlement", width: 22 }, { header: "Type", width: 11 }, { header: "Razorpay id", width: 22 },
        { header: "Date", width: 18 }, { header: "Rider", width: 22 }, { header: "Bill", width: 18 },
        { header: "Method", width: 10 }, { header: "Amount", width: 12 }, { header: "Fee incl. GST", width: 13 },
        { header: "GST on fee", width: 11 }, { header: "Net", width: 12 }, { header: "Match", width: 11 },
        { header: "Exception", width: 10 },
    ];
    ln.getRow(1).font = { bold: true };
    for (const l of lines) {
        ln.addRow([byId.get(l.statementId)?.external_ref ?? "", l.kind, l.externalId ?? "", l.occurredAt ?? "",
            l.riderName ?? "", l.billNumber ?? "", l.method ?? "", l.amount, l.fee, l.tax, l.netAmount,
            l.matchStatus, l.exceptionCode ?? ""]);
    }
    for (const c of [8, 9, 10, 11]) ln.getColumn(c).numFmt = MONEY;

    const ex = wb.addWorksheet("Exceptions");
    ex.columns = [
        { header: "Code", width: 8 }, { header: "Razorpay id", width: 24 }, { header: "Date", width: 18 },
        { header: "Rider", width: 22 }, { header: "Amount", width: 12 }, { header: "What it means", width: 70 },
    ];
    ex.getRow(1).font = { bold: true };
    for (const e of exceptions) {
        ex.addRow([e.code, e.externalId ?? "", e.occurredAt ?? "", e.riderName ?? "", e.amount, e.description ?? ""]);
    }
    ex.getColumn(5).numFmt = MONEY;

    return {
        filename: `swapngo-razorpay-statement_${month}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Buffer.from(await wb.xlsx.writeBuffer()),
    };
}
