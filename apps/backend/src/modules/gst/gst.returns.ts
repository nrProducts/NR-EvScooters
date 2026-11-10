import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { supabaseAdmin } from "../../config/supabase";
import { badRequest, businessRule } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import type { AuthContext } from "../../types";
import { getItcSummary, type ItcMonthSummary } from "../purchases/purchases.service";
import { buildSettlementExport, getSettlementMonthSummary, monthBounds } from "../reconciliation/statements.service";
import { getTieOut } from "../reconciliation/bank.service";
import { addReturnPdfsToZip, buildReturnRegisterXlsx, documentsForReturn, getPendingTaxDocuments, listGstProfiles, summarise } from "./gst.service";
import type { TaxDocumentRow } from "./gst.types";

/**
 * GST Stage 5 — the monthly filing pack (supabase/migrations/20261110130000_gst_filing.sql).
 *
 * Every figure is computed from stored records: output tax from the tax
 * documents REPORTED in the month (return_period), credit from confirmed
 * purchase bills claimed in it. Only what was filed — ARN, date, cash paid
 * and a frozen snapshot — is stored, in finance_periods.
 */
const db = supabaseAdmin as unknown as SupabaseClient;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Registration took effect 2 Sep 2026: September 2026 is the first return. */
export const FIRST_RETURN_MONTH = "2026-09";

type Status = "not_started" | "ready" | "sent" | "filed";

export interface ReturnPeriodRow {
    month: string;
    gstr1: { status: Status; arn: string | null; filedOn: string | null; dueOn: string; overdueDays: number };
    gstr3b: { status: Status; arn: string | null; filedOn: string | null; dueOn: string; overdueDays: number };
    taxPaidCash: number | null;
    challanCpin: string | null;
    locked: boolean;
}

export interface Check { key: string; label: string; ok: boolean; detail: string }

export interface Worksheet {
    month: string;
    gstin: string;
    legalName: string;
    status: ReturnPeriodRow;
    gstr1: {
        /** Table 7 — B2C, intra-state Tamil Nadu, one row per rate (net of credit notes). */
        table7: { rate: number; placeOfSupply: string; taxable: number; cgst: number; sgst: number }[];
        /** Table 12 — HSN/SAC summary, B2C. */
        table12: { sac: string; rate: number; taxable: number; cgst: number; sgst: number; total: number }[];
        /** Table 13 — documents issued. */
        table13: { nature: "Invoices for outward supply" | "Credit notes"; from: string | null; to: string | null; total: number; cancelled: number; net: number }[];
    };
    gstr3b: {
        /** 3.1(a) outward taxable supplies, net of credit notes. */
        outward: { taxable: number; igst: number; cgst: number; sgst: number };
        /** 3.1(d) inward supplies liable to reverse charge. */
        reverseCharge: { taxable: number; igst: number };
        itc: ItcMonthSummary;
        setOff: {
            liability: { igst: number; cgst: number; sgst: number };
            creditUsed: { igstAgainstCgst: number; igstAgainstSgst: number; cgstAgainstCgst: number; sgstAgainstSgst: number };
            /** Cash to pay: forward-charge balance plus all reverse-charge IGST (which cannot be paid from credit). */
            cash: { igst: number; cgst: number; sgst: number; total: number };
            creditCarriedForward: { igst: number; cgst: number; sgst: number };
        };
        /** If filed today: 18% a year on the cash part after the due date, and the late fee. Estimates. */
        lateEstimate: { daysLate: number; interest: number; lateFee: number };
    };
    checks: Check[];
    ready: boolean;
}

const isoDay = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function dueDates(month: string): { gstr1: string; gstr3b: string } {
    const [y, m] = month.split("-").map(Number);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return { gstr1: isoDay(ny, nm, 11), gstr3b: isoDay(ny, nm, 20) };
}
const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

function monthsFrom(first: string, last: string): string[] {
    const out: string[] = [];
    let [y, m] = first.split("-").map(Number);
    const [ly, lm] = last.split("-").map(Number);
    while (y < ly || (y === ly && m <= lm)) {
        out.push(`${y}-${String(m).padStart(2, "0")}`);
        m += 1;
        if (m > 12) { m = 1; y += 1; }
    }
    return out;
}

interface RawPeriod {
    period: string; gstr1_status: Status; gstr1_arn: string | null; gstr1_filed_on: string | null;
    gstr3b_status: Status; gstr3b_arn: string | null; gstr3b_filed_on: string | null;
    tax_paid_cash: number | string | null; challan_cpin: string | null;
    gstr1_snapshot: unknown; gstr3b_snapshot: unknown;
}

function toPeriodRow(month: string, r: RawPeriod | undefined, today: string): ReturnPeriodRow {
    const due = dueDates(month);
    const late = (status: Status, filedOn: string | null, dueOn: string) =>
        Math.max(0, daysBetween(dueOn, status === "filed" && filedOn ? filedOn : today));
    const g1 = r?.gstr1_status ?? "not_started";
    const g3 = r?.gstr3b_status ?? "not_started";
    return {
        month,
        gstr1: { status: g1, arn: r?.gstr1_arn ?? null, filedOn: r?.gstr1_filed_on ?? null, dueOn: due.gstr1, overdueDays: late(g1, r?.gstr1_filed_on ?? null, due.gstr1) },
        gstr3b: { status: g3, arn: r?.gstr3b_arn ?? null, filedOn: r?.gstr3b_filed_on ?? null, dueOn: due.gstr3b, overdueDays: late(g3, r?.gstr3b_filed_on ?? null, due.gstr3b) },
        taxPaidCash: r?.tax_paid_cash == null ? null : Number(r.tax_paid_cash),
        challanCpin: r?.challan_cpin ?? null,
        locked: g3 === "filed",
    };
}

export async function listReturnPeriods(): Promise<ReturnPeriodRow[]> {
    const today = businessToday();
    const { data, error } = await db.from("finance_periods").select("*");
    if (error) throw error;
    const byMonth = new Map(((data ?? []) as RawPeriod[]).map((r) => [r.period.slice(0, 7), r]));
    // Up to last month: the current month has no return yet.
    const [ty, tm] = today.split("-").map(Number);
    const last = tm === 1 ? `${ty - 1}-12` : `${ty}-${String(tm - 1).padStart(2, "0")}`;
    if (last < FIRST_RETURN_MONTH) return [];
    return monthsFrom(FIRST_RETURN_MONTH, last).reverse().map((m) => toPeriodRow(m, byMonth.get(m), today));
}

async function periodRow(month: string): Promise<{ row: ReturnPeriodRow; raw: RawPeriod | undefined }> {
    const { data, error } = await db.from("finance_periods").select("*").eq("period", `${month}-01`).maybeSingle();
    if (error) throw error;
    const raw = (data as RawPeriod | null) ?? undefined;
    return { row: toPeriodRow(month, raw, businessToday()), raw };
}

/** Rule 88A order, pure — exported for tests. */
export function computeSetOff(
    liability: { igst: number; cgst: number; sgst: number },
    reverseChargeIgst: number,
    credit: { igst: number; cgst: number; sgst: number },
): Worksheet["gstr3b"]["setOff"] {
    // Reverse-charge tax is always paid in cash; credit offsets the forward-charge part only.
    let i = credit.igst;
    let c = credit.cgst;
    let s = credit.sgst;
    let fwdIgst = round2(liability.igst - reverseChargeIgst);
    let fwdCgst = liability.cgst;
    let fwdSgst = liability.sgst;

    const igstOnIgst = Math.min(i, fwdIgst); i = round2(i - igstOnIgst); fwdIgst = round2(fwdIgst - igstOnIgst);
    // IGST credit next, against CGST then SGST (Rule 88A), before their own credits.
    const igstAgainstCgst = Math.min(i, fwdCgst); i = round2(i - igstAgainstCgst); fwdCgst = round2(fwdCgst - igstAgainstCgst);
    const igstAgainstSgst = Math.min(i, fwdSgst); i = round2(i - igstAgainstSgst); fwdSgst = round2(fwdSgst - igstAgainstSgst);
    const cgstAgainstCgst = Math.min(c, fwdCgst); c = round2(c - cgstAgainstCgst); fwdCgst = round2(fwdCgst - cgstAgainstCgst);
    const sgstAgainstSgst = Math.min(s, fwdSgst); s = round2(s - sgstAgainstSgst); fwdSgst = round2(fwdSgst - sgstAgainstSgst);

    const cash = { igst: round2(fwdIgst + reverseChargeIgst), cgst: fwdCgst, sgst: fwdSgst, total: 0 };
    cash.total = round2(cash.igst + cash.cgst + cash.sgst);
    return {
        liability,
        creditUsed: {
            igstAgainstCgst: round2(igstAgainstCgst), igstAgainstSgst: round2(igstAgainstSgst),
            cgstAgainstCgst: round2(cgstAgainstCgst), sgstAgainstSgst: round2(sgstAgainstSgst),
        },
        cash,
        creditCarriedForward: { igst: round2(i), cgst: round2(c), sgst: round2(s) },
    };
}

/**
 * Late fee and interest if filed today — estimates for a small taxpayer.
 * Late fee ₹50/day (₹25 CGST + ₹25 SGST), ₹20/day for a nil return, capped
 * at ₹2,000 / ₹500 per return for turnover up to ₹1.5 crore. Interest: 18% a
 * year on the cash part (s. 50). Pure — exported for tests.
 */
export function lateEstimate(daysLate: number, cashTotal: number, nilReturn: boolean): { daysLate: number; interest: number; lateFee: number } {
    if (daysLate <= 0) return { daysLate: 0, interest: 0, lateFee: 0 };
    const fee = Math.min(daysLate * (nilReturn ? 20 : 50), nilReturn ? 500 : 2000);
    return { daysLate, interest: round2((cashTotal * 0.18 * daysLate) / 365), lateFee: fee };
}

function gstr1Tables(docs: TaxDocumentRow[]): Worksheet["gstr1"] {
    const live = docs.filter((d) => d.status === "issued");
    const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; sac: string }>();
    for (const d of live) {
        const sign = d.docType === "credit_note" ? -1 : 1;
        const r = byRate.get(d.gstRate) ?? { taxable: 0, cgst: 0, sgst: 0, sac: d.sacCode };
        r.taxable = round2(r.taxable + sign * d.taxableAmount);
        r.cgst = round2(r.cgst + sign * d.cgstAmount);
        r.sgst = round2(r.sgst + sign * d.sgstAmount);
        byRate.set(d.gstRate, r);
    }
    const series = (type: TaxDocumentRow["docType"]) => {
        const all = docs.filter((d) => d.docType === type).map((d) => d.docNumber).sort();
        const cancelled = docs.filter((d) => d.docType === type && d.status === "cancelled").length;
        return { from: all[0] ?? null, to: all[all.length - 1] ?? null, total: all.length, cancelled, net: all.length - cancelled };
    };
    return {
        table7: [...byRate.entries()].map(([rate, v]) => ({ rate, placeOfSupply: "33", taxable: v.taxable, cgst: v.cgst, sgst: v.sgst })),
        table12: [...byRate.entries()].map(([rate, v]) => ({ sac: v.sac, rate, taxable: v.taxable, cgst: v.cgst, sgst: v.sgst, total: round2(v.taxable + v.cgst + v.sgst) })),
        table13: [
            { nature: "Invoices for outward supply", ...series("tax_invoice") },
            { nature: "Credit notes", ...series("credit_note") },
        ],
    };
}

export async function buildWorksheet(month: string): Promise<Worksheet> {
    const { from, to } = monthBounds(month);
    const [docs, itc, { row }, profiles, pending, settlement, tieOut, drafts, twoB, exceptions] = await Promise.all([
        documentsForReturn(month),
        getItcSummary(month),
        periodRow(month),
        listGstProfiles(),
        getPendingTaxDocuments(),
        getSettlementMonthSummary(month),
        getTieOut(month),
        db.from("purchase_bills").select("id", { count: "exact", head: true }).eq("status", "draft").eq("itc_month", `${month}-01`),
        db.from("external_statements").select("id").eq("source", "gstr2b").eq("statement_date", `${month}-01`).limit(1),
        db.from("external_statement_lines").select("id", { count: "exact", head: true })
            .eq("match_status", "exception").gte("occurred_at", `${from}T00:00:00+05:30`).lte("occurred_at", `${to}T23:59:59+05:30`),
    ]);
    for (const r of [drafts, twoB, exceptions]) if (r.error) throw r.error;

    const profile = profiles.find((p) => p.effectiveFrom <= to) ?? profiles[profiles.length - 1];
    const summary = summarise(docs, from, to);
    const outward = { taxable: summary.net.taxable, igst: 0, cgst: summary.net.cgst, sgst: summary.net.sgst };
    const liability = { igst: round2(itc.reverseCharge.igst), cgst: outward.cgst, sgst: outward.sgst };
    const setOff = computeSetOff(liability, itc.reverseCharge.igst, itc.eligible);
    const lastPeriodEnd = new Date(`${to}T00:00:00Z`);
    lastPeriodEnd.setUTCDate(lastPeriodEnd.getUTCDate() + 2);
    const pendingInMonth = pending.total; // the sweep issues everything owed, any month

    const checks: Check[] = [
        {
            key: "razorpay", label: "Razorpay settlements synced through month-end",
            ok: !!settlement.syncedSince && settlement.settlementCount > 0,
            detail: settlement.settlementCount ? `${settlement.settlementCount} settlements synced.` : "Run a Razorpay sync for this month.",
        },
        {
            key: "exceptions", label: "No open reconciliation exceptions for the month",
            ok: (exceptions.count ?? 0) === 0,
            detail: exceptions.count ? `${exceptions.count} open — see Reconciliation → Exceptions.` : "None open.",
        },
        {
            key: "bank", label: "HDFC statement imported and tied to Razorpay",
            ok: !!tieOut.bankCoveredUntil && tieOut.bankCoveredUntil >= to && Math.abs(tieOut.difference) < 0.01 && tieOut.notReceived.length === 0,
            detail: !tieOut.bankCoveredUntil || tieOut.bankCoveredUntil < to
                ? "Import the bank statement covering the whole month."
                : Math.abs(tieOut.difference) >= 0.01 ? `Razorpay and the bank differ by ${tieOut.difference.toFixed(2)}.` : "Tied.",
        },
        {
            key: "bills", label: "Purchase bills entered and GSTR-2B matched",
            ok: (drafts.count ?? 0) === 0 && (twoB.data ?? []).length > 0,
            detail: (drafts.count ?? 0) > 0 ? `${drafts.count} draft bill(s) not confirmed.` : (twoB.data ?? []).length === 0 ? "Import this month's GSTR-2B (available on the 14th)." : "Done.",
        },
        {
            key: "documents", label: "Every tax invoice and credit note issued (incl. bills unpaid 30 days)",
            ok: pendingInMonth === 0,
            detail: pendingInMonth ? `${pendingInMonth} document(s) still to issue — Tax Invoices → Issue now.` : "All issued.",
        },
        {
            key: "profile", label: "A GST profile is in force for the month",
            ok: !!profile && profile.effectiveFrom <= to,
            detail: profile ? `${profile.legalName} · ${profile.gstin} · ${profile.gstRate}%` : "Add the GST profile.",
        },
    ];

    const nil = summary.taxInvoices.count === 0 && summary.creditNotes.count === 0 && itc.billCount === 0;
    return {
        month,
        gstin: profile?.gstin ?? "",
        legalName: profile?.legalName ?? "",
        status: row,
        gstr1: gstr1Tables(docs),
        gstr3b: {
            outward,
            reverseCharge: { taxable: itc.reverseCharge.taxable, igst: itc.reverseCharge.igst },
            itc,
            setOff,
            lateEstimate: lateEstimate(row.gstr3b.status === "filed" ? 0 : row.gstr3b.overdueDays, setOff.cash.total, nil),
        },
        checks,
        ready: checks.every((c) => c.ok),
    };
}

/**
 * The GSTR-1 JSON the GST portal's offline tool imports, for a B2C-only
 * supplier: B2CS (Table 7), the HSN summary (Table 12, B2C) and the
 * documents-issued summary (Table 13). Field names follow the offline
 * tool's schema; check them against the tool's current version before the
 * first upload. Pure — exported for tests.
 */
export function gstr1Json(ws: Pick<Worksheet, "month" | "gstin" | "gstr1">): Record<string, unknown> {
    const [y, m] = ws.month.split("-");
    return {
        gstin: ws.gstin,
        fp: `${m}${y}`,
        b2cs: ws.gstr1.table7.map((r) => ({
            sply_ty: "INTRA", rt: r.rate, typ: "OE", pos: r.placeOfSupply,
            txval: r.taxable, camt: r.cgst, samt: r.sgst, csamt: 0,
        })),
        hsn: {
            hsn_b2c: ws.gstr1.table12.map((r, i) => ({
                num: i + 1, hsn_sc: r.sac, uqc: "NA", qty: 0, rt: r.rate,
                txval: r.taxable, iamt: 0, camt: r.cgst, samt: r.sgst, csamt: 0,
            })),
        },
        doc_issue: {
            doc_det: ws.gstr1.table13
                .filter((t) => t.total > 0)
                .map((t) => ({
                    doc_num: t.nature === "Credit notes" ? 5 : 1,
                    docs: [{ num: 1, from: t.from, to: t.to, totnum: t.total, cancel: t.cancelled, net_issue: t.net }],
                })),
        },
    };
}

export interface StatusInput {
    return: "gstr1" | "gstr3b";
    status: Status;
    arn?: string | null;
    filedOn?: string | null;
    taxPaidCash?: number | null;
    challanCpin?: string | null;
    interestPaid?: number | null;
    lateFeePaid?: number | null;
}

export async function updateReturnStatus(month: string, input: StatusInput, actor: AuthContext): Promise<ReturnPeriodRow> {
    if (month < FIRST_RETURN_MONTH) throw badRequest("There is no GST return before September 2026.");
    const { raw } = await periodRow(month);
    const current = input.return === "gstr1" ? raw?.gstr1_status : raw?.gstr3b_status;
    if (current === "filed") throw businessRule("This return is already marked filed; a filed return cannot change.");

    const fields: Record<string, unknown> = { period: `${month}-01` };
    if (input.status === "filed") {
        if (!input.arn?.trim() || !input.filedOn) throw badRequest("A filed return needs its ARN and filing date.", { arn: "Enter the ARN from the portal." });
        if (input.return === "gstr3b" && raw?.gstr1_status !== "filed") {
            throw businessRule("Mark GSTR-1 filed first — GSTR-3B is filed after it.");
        }
        const ws = await buildWorksheet(month);
        if (input.return === "gstr1") {
            Object.assign(fields, { gstr1_status: "filed", gstr1_arn: input.arn.trim(), gstr1_filed_on: input.filedOn, gstr1_snapshot: { gstr1: ws.gstr1, json: gstr1Json(ws) } });
        } else {
            Object.assign(fields, {
                gstr3b_status: "filed", gstr3b_arn: input.arn.trim(), gstr3b_filed_on: input.filedOn, gstr3b_snapshot: ws.gstr3b,
                tax_paid_cash: input.taxPaidCash ?? ws.gstr3b.setOff.cash.total, challan_cpin: input.challanCpin?.trim() || null,
                interest_paid: input.interestPaid ?? null, late_fee_paid: input.lateFeePaid ?? null,
                closed_by_user_id: actor.id, closed_at: new Date().toISOString(),
            });
        }
    } else {
        Object.assign(fields, input.return === "gstr1" ? { gstr1_status: input.status } : { gstr3b_status: input.status });
    }

    const { error } = await db.from("finance_periods").upsert(fields, { onConflict: "period" });
    if (error) throw error;
    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "gst.return_status_changed",
        entityType: "finance_period", entityId: `${month}-01`,
        before: { status: current ?? "not_started" },
        after: { return: input.return, status: input.status, arn: input.arn ?? null, filed_on: input.filedOn ?? null },
    });
    return (await periodRow(month)).row;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

async function worksheetXlsx(ws: Worksheet): Promise<Buffer> {
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SwapNgo";
    const MONEY = "#,##0.00";

    const one = wb.addWorksheet("GSTR-1");
    one.columns = [{ width: 34 }, { width: 14 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }];
    one.addRow([`GSTR-1 · ${ws.month} · ${ws.legalName} · ${ws.gstin}`]).font = { bold: true, size: 13 };
    one.addRow([]);
    one.addRow(["Table 7 — B2C (others), intra-state"]).font = { bold: true };
    one.addRow(["Place of supply", "Rate %", "Taxable value", "CGST", "SGST"]).font = { bold: true };
    for (const r of ws.gstr1.table7) one.addRow([`Tamil Nadu (${r.placeOfSupply})`, r.rate, r.taxable, r.cgst, r.sgst]);
    one.addRow([]);
    one.addRow(["Table 12 — HSN/SAC summary (B2C)"]).font = { bold: true };
    one.addRow(["SAC", "Rate %", "Taxable value", "CGST", "SGST", "Total"]).font = { bold: true };
    for (const r of ws.gstr1.table12) one.addRow([r.sac, r.rate, r.taxable, r.cgst, r.sgst, r.total]);
    one.addRow([]);
    one.addRow(["Table 13 — documents issued"]).font = { bold: true };
    one.addRow(["Nature", "From", "To", "Total", "Cancelled", "Net issued"]).font = { bold: true };
    for (const t of ws.gstr1.table13) one.addRow([t.nature, t.from ?? "", t.to ?? "", t.total, t.cancelled, t.net]);
    for (const c of [3, 4, 5, 6]) one.getColumn(c).numFmt = MONEY;

    const three = wb.addWorksheet("GSTR-3B");
    three.columns = [{ width: 52 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }];
    const g = ws.gstr3b;
    three.addRow([`GSTR-3B · ${ws.month}`]).font = { bold: true, size: 13 };
    three.addRow([]);
    three.addRow(["", "Taxable value", "IGST", "CGST", "SGST"]).font = { bold: true };
    three.addRow(["3.1(a) Outward taxable supplies (net of credit notes)", g.outward.taxable, g.outward.igst, g.outward.cgst, g.outward.sgst]);
    three.addRow(["3.1(d) Inward supplies on reverse charge", g.reverseCharge.taxable, g.reverseCharge.igst, 0, 0]);
    three.addRow([]);
    three.addRow(["4A(3) ITC — reverse charge, claimed back", "", g.itc.reverseCharge.igst, 0, 0]);
    three.addRow(["4A(5) ITC — all other (in GSTR-2B), less reverse charge", "", round2(g.itc.eligible.igst - g.itc.reverseCharge.igst), g.itc.eligible.cgst, g.itc.eligible.sgst]);
    three.addRow(["4A / 4B(1) Blocked under s. 17(5): shown, then reversed", "", g.itc.blocked.igst, g.itc.blocked.cgst, g.itc.blocked.sgst]);
    three.addRow(["Not claimed: awaiting the supplier's GSTR-2B", "", g.itc.awaiting2b.igst, g.itc.awaiting2b.cgst, g.itc.awaiting2b.sgst]);
    three.addRow(["Not claimed: under review", "", g.itc.review.igst, g.itc.review.cgst, g.itc.review.sgst]);
    three.addRow([]);
    three.addRow(["6.1 Cash to pay after set-off", "", g.setOff.cash.igst, g.setOff.cash.cgst, g.setOff.cash.sgst]).font = { bold: true };
    three.addRow(["Total cash", g.setOff.cash.total]).font = { bold: true };
    three.addRow(["Credit carried forward", "", g.setOff.creditCarriedForward.igst, g.setOff.creditCarriedForward.cgst, g.setOff.creditCarriedForward.sgst]);
    if (g.lateEstimate.daysLate > 0) {
        three.addRow([]);
        three.addRow([`If filed today: ${g.lateEstimate.daysLate} day(s) late — interest (estimate)`, g.lateEstimate.interest]);
        three.addRow(["Late fee (estimate)", g.lateEstimate.lateFee]);
    }
    for (const c of [2, 3, 4, 5]) three.getColumn(c).numFmt = MONEY;

    const ck = wb.addWorksheet("Checks");
    ck.columns = [{ width: 60 }, { width: 8 }, { width: 70 }];
    ck.addRow(["Check", "OK", "Detail"]).font = { bold: true };
    for (const c of ws.checks) ck.addRow([c.label, c.ok ? "Yes" : "No", c.detail]);

    return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildWorksheetXlsx(month: string): Promise<{ filename: string; contentType: string; body: Buffer }> {
    return {
        filename: `swapngo-gst-worksheet_${month}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: await worksheetXlsx(await buildWorksheet(month)),
    };
}

async function purchaseRegisterXlsx(month: string): Promise<Buffer> {
    const { data, error } = await db.from("purchase_bills")
        .select("bill_number, bill_date, is_reverse_charge, gstr2b_status, status, vendors(name, gstin), purchase_bill_lines(description, category, taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, itc_status)")
        .eq("itc_month", `${month}-01`).neq("status", "cancelled").order("bill_date");
    if (error) throw error;
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Purchases");
    ws.columns = [
        { header: "Bill date", width: 12 }, { header: "Vendor", width: 26 }, { header: "GSTIN", width: 18 }, { header: "Bill no.", width: 18 },
        { header: "Line", width: 36 }, { header: "Category", width: 20 }, { header: "Taxable", width: 13 }, { header: "Rate %", width: 8 },
        { header: "CGST", width: 11 }, { header: "SGST", width: 11 }, { header: "IGST", width: 11 }, { header: "Total", width: 13 },
        { header: "ITC", width: 10 }, { header: "Reverse charge", width: 10 }, { header: "GSTR-2B", width: 12 }, { header: "Status", width: 10 },
    ];
    ws.getRow(1).font = { bold: true };
    const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;
    for (const b of (data ?? []) as Record<string, unknown>[]) {
        const v = one(b.vendors as { name: string; gstin: string | null } | null);
        for (const l of (b.purchase_bill_lines as Record<string, unknown>[]) ?? []) {
            ws.addRow([b.bill_date, v?.name ?? "", v?.gstin ?? "", b.bill_number, l.description, l.category,
                Number(l.taxable_amount), Number(l.gst_rate), Number(l.cgst_amount), Number(l.sgst_amount), Number(l.igst_amount),
                Number(l.total_amount), l.itc_status, b.is_reverse_charge ? "Yes" : "No", b.gstr2b_status, b.status]);
        }
    }
    for (const c of [7, 9, 10, 11, 12]) ws.getColumn(c).numFmt = "#,##0.00";
    return Buffer.from(await wb.xlsx.writeBuffer());
}

/**
 * The monthly auditor pack — every item Taxkey asks for, in one ZIP:
 * the GST worksheet and GSTR-1 JSON, the sales register and every tax
 * invoice / credit note PDF, the Razorpay statement, the purchase register,
 * and the bank tie-out.
 */
export async function buildAuditorPack(month: string, actor: AuthContext): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const ws = await buildWorksheet(month);
    const zip = new JSZip();
    const p = `swapngo-gst-${month}/`;
    zip.file(`${p}01-gst-worksheet.xlsx`, await worksheetXlsx(ws));
    zip.file(`${p}02-gstr1-offline-tool.json`, JSON.stringify(gstr1Json(ws), null, 2));
    zip.file(`${p}03-sales-register.xlsx`, await buildReturnRegisterXlsx(month));
    await addReturnPdfsToZip(zip, month, `${p}04-documents/`);
    zip.file(`${p}05-razorpay-statement.xlsx`, (await buildSettlementExport(month)).body);
    zip.file(`${p}06-purchase-register.xlsx`, await purchaseRegisterXlsx(month));
    const tie = await getTieOut(month);
    zip.file(`${p}07-bank-tie-out.json`, JSON.stringify(tie, null, 2));
    zip.file(`${p}README.txt`, [
        `Swapngo Fleet Hub — GST pack for ${month}`,
        `GSTIN ${ws.gstin}`,
        "",
        "01  GST worksheet: GSTR-1 tables 7, 12, 13; GSTR-3B 3.1, 4 and 6.1; readiness checks",
        "02  GSTR-1 JSON for the GST offline tool (B2CS, HSN B2C, documents issued)",
        "03  Sales register: every tax invoice and credit note reported in the month",
        "04  The documents themselves, as PDFs",
        "05  Razorpay statement: settlements, lines, fees, GST on fees, exceptions",
        "06  Purchase register: bills claimed in the month, line by line, with ITC status",
        "07  Razorpay to HDFC tie-out",
        "",
        `Readiness: ${ws.ready ? "all checks passed" : ws.checks.filter((c) => !c.ok).map((c) => c.label).join("; ")}`,
    ].join("\r\n"));

    await writeAudit({ actorId: actor.id, targetUserId: null, action: "gst.pack_downloaded", entityType: "finance_period", entityId: `${month}-01`, after: { ready: ws.ready } });
    return {
        filename: `swapngo-gst-pack_${month}.zip`,
        contentType: "application/zip",
        body: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    };
}
