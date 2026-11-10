import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import type { AuthContext } from "../../types";

/**
 * GST Stage 6 — the books (supabase/migrations/20261110140000_ledger_view.sql).
 *
 * v_ledger_postings derives double-entry postings from the stored money
 * events; this module only reads it: trial balance, profit and loss, the
 * registers that prove the balances, an advance-tax estimate and the Tally
 * export for the CA. Nothing here writes.
 */
const db = supabaseAdmin as unknown as SupabaseClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

export type LedgerGroup =
    | "Bank Accounts" | "Cash-in-Hand" | "Current Assets" | "Fixed Assets" | "Duties & Taxes"
    | "Current Liabilities" | "Sundry Creditors" | "Capital Account" | "Loans (Liability)"
    | "Direct Incomes" | "Indirect Incomes" | "Direct Expenses" | "Indirect Expenses" | "Suspense A/c";

/**
 * Each ledger's group — the same names Tally uses for its predefined groups,
 * so the export imports under the right heads without any mapping by hand.
 */
export function groupOf(ledger: string): LedgerGroup {
    if (ledger.startsWith("Creditor: ")) return "Sundry Creditors";
    if (ledger.startsWith("Fixed Assets")) return "Fixed Assets";
    switch (ledger) {
        case "HDFC Bank": return "Bank Accounts";
        case "Cash in Hand": return "Cash-in-Hand";
        case "Razorpay Clearing": case "UPI QR Clearing": case "Rider Receivables": case "Internal Transfers":
        case "GST Electronic Cash Ledger": case "Income Tax Paid": return "Current Assets";
        case "Output CGST": case "Output SGST": case "Input CGST": case "Input SGST": case "Input IGST":
        case "Input GST on Gateway Fees": case "Reverse Charge IGST Payable": case "TDS Payable": return "Duties & Taxes";
        case "Rider Security Deposits": return "Current Liabilities";
        case "Partners Capital": case "Partners Drawings": return "Capital Account";
        case "Loans": return "Loans (Liability)";
        case "Rental Income": case "Deposit Retained Income": return "Direct Incomes";
        case "Other Income": case "Vendor Refunds": return "Indirect Incomes";
        case "Battery Swap Charges": case "Repairs and Spares": case "Vehicle Insurance": return "Direct Expenses";
        case "Suspense": return "Suspense A/c";
        default: return "Indirect Expenses";
    }
}

const isIncome = (g: LedgerGroup) => g === "Direct Incomes" || g === "Indirect Incomes";
const isExpense = (g: LedgerGroup) => g === "Direct Expenses" || g === "Indirect Expenses";

export interface Posting {
    postingDate: string; voucherKey: string; voucherType: string; sourceType: string; sourceId: string;
    ledger: string; debit: number; credit: number; narration: string | null; party: string | null;
}

async function postings(f: { from?: string; to: string }): Promise<Posting[]> {
    const out: Posting[] = [];
    for (let offset = 0; ; offset += 1000) {
        let q = db.from("v_ledger_postings").select("*").lte("posting_date", f.to);
        if (f.from) q = q.gte("posting_date", f.from);
        const { data, error } = await q.order("posting_date").order("voucher_key").range(offset, offset + 999);
        if (error) throw error;
        for (const r of (data ?? []) as Record<string, unknown>[]) {
            out.push({
                postingDate: r.posting_date as string, voucherKey: r.voucher_key as string, voucherType: r.voucher_type as string,
                sourceType: r.source_type as string, sourceId: r.source_id as string, ledger: r.ledger as string,
                debit: Number(r.debit ?? 0), credit: Number(r.credit ?? 0),
                narration: (r.narration as string | null) ?? null, party: (r.party as string | null) ?? null,
            });
        }
        if ((data ?? []).length < 1000) break;
    }
    return out;
}

export interface TrialBalanceRow { ledger: string; group: LedgerGroup; opening: number; debit: number; credit: number; closing: number }

/** Balances are debit-positive. Pure — exported for tests. */
export function trialBalanceFrom(all: Posting[], from: string): TrialBalanceRow[] {
    const rows = new Map<string, TrialBalanceRow>();
    for (const p of all) {
        const r = rows.get(p.ledger) ?? { ledger: p.ledger, group: groupOf(p.ledger), opening: 0, debit: 0, credit: 0, closing: 0 };
        if (p.postingDate < from) r.opening = round2(r.opening + p.debit - p.credit);
        else { r.debit = round2(r.debit + p.debit); r.credit = round2(r.credit + p.credit); }
        rows.set(p.ledger, r);
    }
    for (const r of rows.values()) r.closing = round2(r.opening + r.debit - r.credit);
    return [...rows.values()].sort((a, b) => a.group.localeCompare(b.group) || a.ledger.localeCompare(b.ledger));
}

export async function getTrialBalance(from: string, to: string): Promise<{ from: string; to: string; rows: TrialBalanceRow[]; totals: { debit: number; credit: number }; unbalancedVouchers: number }> {
    const [all, unbalanced] = await Promise.all([
        postings({ to }),
        db.from("v_ledger_unbalanced").select("voucher_key", { count: "exact", head: true }),
    ]);
    if (unbalanced.error) throw unbalanced.error;
    const rows = trialBalanceFrom(all, from);
    return {
        from, to, rows,
        totals: { debit: round2(rows.reduce((t, r) => t + r.debit, 0)), credit: round2(rows.reduce((t, r) => t + r.credit, 0)) },
        unbalancedVouchers: unbalanced.count ?? 0,
    };
}

export interface ProfitAndLoss {
    from: string; to: string;
    income: { ledger: string; group: LedgerGroup; amount: number }[];
    expenses: { ledger: string; group: LedgerGroup; amount: number }[];
    totalIncome: number; totalExpenses: number; profit: number;
}

/** Pure — exported for tests. */
export function profitAndLossFrom(period: Posting[], from: string, to: string): ProfitAndLoss {
    const income = new Map<string, number>();
    const expenses = new Map<string, number>();
    for (const p of period) {
        const g = groupOf(p.ledger);
        if (isIncome(g)) income.set(p.ledger, round2((income.get(p.ledger) ?? 0) + p.credit - p.debit));
        else if (isExpense(g)) expenses.set(p.ledger, round2((expenses.get(p.ledger) ?? 0) + p.debit - p.credit));
    }
    const list = (m: Map<string, number>) => [...m.entries()].map(([ledger, amount]) => ({ ledger, group: groupOf(ledger), amount }))
        .sort((a, b) => b.amount - a.amount);
    const totalIncome = round2([...income.values()].reduce((t, v) => t + v, 0));
    const totalExpenses = round2([...expenses.values()].reduce((t, v) => t + v, 0));
    return { from, to, income: list(income), expenses: list(expenses), totalIncome, totalExpenses, profit: round2(totalIncome - totalExpenses) };
}

export async function getProfitAndLoss(from: string, to: string): Promise<ProfitAndLoss> {
    return profitAndLossFrom(await postings({ from, to }), from, to);
}

// ---------------------------------------------------------------------------
// Registers that prove the balances
// ---------------------------------------------------------------------------

export async function getDepositRegister(): Promise<{
    rows: { depositId: string; riderName: string | null; amount: number; status: string; heldAt: string | null; refundEligibleOn: string | null }[];
    heldTotal: number; ledgerBalance: number; difference: number;
}> {
    const today = businessToday();
    const [{ data, error }, all] = await Promise.all([
        db.from("deposits").select("id, amount, status, held_at, refund_eligible_on, subscriptions!inner(users(full_name))").eq("status", "held").order("held_at"),
        postings({ to: today }),
    ]);
    if (error) throw error;
    const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;
    const rows = ((data ?? []) as { id: string; amount: number | string; status: string; held_at: string | null; refund_eligible_on: string | null; subscriptions: unknown }[])
        .map((d) => {
            const sub = one(d.subscriptions as { users: unknown } | null);
            return {
                depositId: d.id, riderName: one(sub?.users as { full_name: string } | null)?.full_name ?? null,
                amount: Number(d.amount), status: d.status, heldAt: d.held_at, refundEligibleOn: d.refund_eligible_on,
            };
        });
    const heldTotal = round2(rows.reduce((t, r) => t + r.amount, 0));
    // A liability: its balance is credit-positive.
    const ledgerBalance = round2(all.filter((p) => p.ledger === "Rider Security Deposits").reduce((t, p) => t + p.credit - p.debit, 0));
    return { rows, heldTotal, ledgerBalance, difference: round2(heldTotal - ledgerBalance) };
}

export async function getReceivables(): Promise<{ invoiceId: string; riderName: string | null; billNumber: string; dueOn: string | null; balance: number; overdueDays: number }[]> {
    // The view has no relationships to embed through, so the bills are read second.
    const { data, error } = await db.from("v_invoice_balances")
        .select("invoice_id, balance_amount").eq("status", "issued").gt("balance_amount", 0);
    if (error) throw error;
    const balances = (data ?? []) as { invoice_id: string; balance_amount: number | string }[];
    const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;
    const bills = new Map<string, { invoice_number: string; due_on: string | null; users: unknown }>();
    for (let i = 0; i < balances.length; i += 200) {
        const ids = balances.slice(i, i + 200).map((b) => b.invoice_id);
        const { data: rows, error: e } = await db.from("invoices").select("id, invoice_number, due_on, users(full_name)").in("id", ids);
        if (e) throw e;
        for (const r of (rows ?? []) as { id: string; invoice_number: string; due_on: string | null; users: unknown }[]) bills.set(r.id, r);
    }
    const today = businessToday();
    return balances
        .map((r) => {
            const inv = bills.get(r.invoice_id) ?? null;
            const due = inv?.due_on ?? null;
            const overdue = due ? Math.max(0, Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000)) : 0;
            return {
                invoiceId: r.invoice_id, riderName: one(inv?.users as { full_name: string } | null)?.full_name ?? null,
                billNumber: inv?.invoice_number ?? "", dueOn: due, balance: Number(r.balance_amount), overdueDays: overdue,
            };
        })
        .sort((a, b) => b.overdueDays - a.overdueDays);
}

// ---------------------------------------------------------------------------
// Advance income tax — a partnership firm
// ---------------------------------------------------------------------------

/**
 * A firm pays 30% on its profit, plus 12% surcharge above ₹1 crore, plus 4%
 * cess, in instalments due by 15 Jun (15%), 15 Sep (45%), 15 Dec (75%) and
 * 15 Mar (100%). The profit here is the books' — before the CA's year-end
 * adjustments (depreciation, partners' interest and remuneration) — so this
 * is an estimate to plan cash, not a computation of tax. Pure — exported for tests.
 */
export function advanceTaxPlan(profitSoFar: number, monthsElapsed: number, paid: number, fyStartYear: number) {
    const projected = monthsElapsed > 0 ? round2((profitSoFar / monthsElapsed) * 12) : 0;
    const base = Math.max(0, projected) * 0.3;
    const surcharge = projected > 10_000_000 ? base * 0.12 : 0;
    const tax = round2((base + surcharge) * 1.04);
    const instalments = [
        { dueOn: `${fyStartYear}-06-15`, cumulativePercent: 15 },
        { dueOn: `${fyStartYear}-09-15`, cumulativePercent: 45 },
        { dueOn: `${fyStartYear}-12-15`, cumulativePercent: 75 },
        { dueOn: `${fyStartYear + 1}-03-15`, cumulativePercent: 100 },
    ].map((i) => ({ ...i, cumulativeDue: round2((tax * i.cumulativePercent) / 100) }));
    return { projectedProfit: projected, estimatedTax: tax, paid: round2(paid), instalments };
}

export async function getAdvanceTax(): Promise<ReturnType<typeof advanceTaxPlan> & { fy: string; profitSoFar: number; monthsElapsed: number }> {
    const today = businessToday();
    const y = Number(today.slice(0, 4));
    const fyStart = Number(today.slice(5, 7)) >= 4 ? y : y - 1;
    const from = `${fyStart}-04-01`;
    // Books start at GST registration (2 Sep 2026); count months from whichever is later.
    const start = from < "2026-09-01" ? "2026-09-01" : from;
    const pl = await getProfitAndLoss(from, today);
    const months = Math.max(1, (y - Number(start.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(start.slice(5, 7)) + 1);
    const all = await postings({ from, to: today });
    const paid = all.filter((p) => p.ledger === "Income Tax Paid").reduce((t, p) => t + p.debit - p.credit, 0);
    return { fy: `${fyStart}-${String((fyStart + 1) % 100).padStart(2, "0")}`, profitSoFar: pl.profit, monthsElapsed: months, ...advanceTaxPlan(pl.profit, months, paid, fyStart) };
}

// ---------------------------------------------------------------------------
// Tally export
// ---------------------------------------------------------------------------

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const tallyDate = (iso: string) => iso.replace(/-/g, "");

/**
 * Tally Prime XML: the ledger masters (each under its predefined group),
 * then one voucher per event. Tally's sign convention: a debit is a
 * negative AMOUNT with ISDEEMEDPOSITIVE Yes. Pure — exported for tests.
 */
export function tallyXml(all: Posting[], companyName: string): string {
    const ledgers = [...new Set(all.map((p) => p.ledger))].sort();
    const vouchers = new Map<string, Posting[]>();
    for (const p of all) vouchers.set(p.voucherKey, [...(vouchers.get(p.voucherKey) ?? []), p]);

    const tallyType = (t: string) => (t === "Sales" || t === "Purchase" || t === "Receipt" || t === "Payment" ? t : "Journal");
    const masters = ledgers.map((l) =>
        `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xml(l)}" ACTION="Create"><NAME>${xml(l)}</NAME><PARENT>${xml(groupOf(l))}</PARENT></LEDGER></TALLYMESSAGE>`);
    const vchs = [...vouchers.entries()].map(([key, ps]) => {
        const first = ps[0];
        const entries = ps.map((p) => {
            const amount = round2(p.credit - p.debit);
            return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xml(p.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${amount < 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
        }).join("");
        const type = tallyType(first.voucherType);
        return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${tallyDate(first.postingDate)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xml(key)}</VOUCHERNUMBER><NARRATION>${xml([first.narration, first.party].filter(Boolean).join(" · "))}</NARRATION>${entries}</VOUCHER></TALLYMESSAGE>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xml(companyName)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${masters.join("")}${vchs.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
}

export async function buildTallyExport(from: string, to: string, actor: AuthContext): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const [all, { data: profile }] = await Promise.all([
        postings({ from, to }),
        db.from("gst_settings").select("legal_name").order("effective_from", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const company = (profile as { legal_name: string } | null)?.legal_name ?? "Swapngo Fleet Hub";
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "gst.books_exported", entityType: "finance_period", entityId: from, after: { format: "tally", from, to, postings: all.length } });
    return { filename: `swapngo-tally_${from}_to_${to}.xml`, contentType: "application/xml; charset=utf-8", body: Buffer.from(tallyXml(all, company), "utf8") };
}

export async function buildBooksXlsx(from: string, to: string, actor: AuthContext): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const [tb, pl, period] = await Promise.all([getTrialBalance(from, to), getProfitAndLoss(from, to), postings({ from, to })]);
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "gst.books_exported", entityType: "finance_period", entityId: from, after: { format: "xlsx", from, to, postings: period.length } });
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SwapNgo";
    const MONEY = "#,##0.00";

    const t = wb.addWorksheet("Trial balance");
    t.columns = [{ header: "Group", width: 22 }, { header: "Ledger", width: 34 }, { header: "Opening", width: 14 }, { header: "Debit", width: 14 }, { header: "Credit", width: 14 }, { header: "Closing", width: 14 }];
    t.getRow(1).font = { bold: true };
    for (const r of tb.rows) t.addRow([r.group, r.ledger, r.opening, r.debit, r.credit, r.closing]);
    t.addRow(["", "Total", "", tb.totals.debit, tb.totals.credit, ""]).font = { bold: true };
    for (const c of [3, 4, 5, 6]) t.getColumn(c).numFmt = MONEY;

    const p = wb.addWorksheet("Profit and loss");
    p.columns = [{ width: 36 }, { width: 16 }];
    p.addRow([`Profit and loss · ${from} to ${to} (before year-end adjustments)`]).font = { bold: true };
    p.addRow(["Income"]).font = { bold: true };
    for (const i of pl.income) p.addRow([i.ledger, i.amount]);
    p.addRow(["Total income", pl.totalIncome]).font = { bold: true };
    p.addRow(["Expenses"]).font = { bold: true };
    for (const e of pl.expenses) p.addRow([e.ledger, e.amount]);
    p.addRow(["Total expenses", pl.totalExpenses]).font = { bold: true };
    p.addRow(["Profit", pl.profit]).font = { bold: true };
    p.getColumn(2).numFmt = MONEY;

    const j = wb.addWorksheet("Day book");
    j.columns = [{ header: "Date", width: 12 }, { header: "Voucher", width: 44 }, { header: "Type", width: 10 }, { header: "Ledger", width: 32 }, { header: "Debit", width: 13 }, { header: "Credit", width: 13 }, { header: "Narration", width: 50 }, { header: "Party", width: 24 }];
    j.getRow(1).font = { bold: true };
    for (const e of period) j.addRow([e.postingDate, e.voucherKey, e.voucherType, e.ledger, e.debit || null, e.credit || null, e.narration, e.party]);
    for (const c of [5, 6]) j.getColumn(c).numFmt = MONEY;

    return {
        filename: `swapngo-books_${from}_to_${to}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: Buffer.from(await wb.xlsx.writeBuffer()),
    };
}

export async function listUnbalanced(): Promise<{ voucherKey: string; postingDate: string; debits: number; credits: number }[]> {
    const { data, error } = await db.from("v_ledger_unbalanced").select("*").order("posting_date").limit(200);
    if (error) throw error;
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        voucherKey: r.voucher_key as string, postingDate: r.posting_date as string, debits: Number(r.debits), credits: Number(r.credits),
    }));
}
