import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import JSZip from "jszip";
import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { badRequest, businessRule, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import { paginate, toRange } from "../../common/pagination";
import type { AuthContext, Paginated } from "../../types";
import { formatDocDate, renderTaxDocumentPdf } from "./gst.pdf";
import type {
    CreateGstProfileInput, GstProfileRow, ListTaxDocumentsFilters, PendingTaxDocuments,
    TaxDocumentLine, TaxDocumentRow, TaxDocumentSummary, TaxDocumentTotals,
} from "./gst.types";

/**
 * GST Stage 1 — the tax-document register, its PDFs and exports, and the GST
 * profile. The documents themselves are issued by the database (see
 * supabase/migrations/20261110100000_gst_tax_documents.sql); nothing here
 * creates one except by asking the database to run its own sweep.
 *
 * gst_settings and tax_documents are not in the generated types yet, hence
 * the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

const DOC_COLUMNS = `id, doc_type, source, series_code, doc_number, supply_date, issued_on, user_id,
    invoice_id, rental_id, refund_id, original_document_id, gst_settings_id, recipient_name,
    place_of_supply, sac_code, gst_rate, taxable_amount, cgst_amount, sgst_amount, igst_amount,
    total_amount, lines, status, created_at, return_period,
    invoices(invoice_number),
    original:tax_documents!tax_documents_original_document_id_fkey(doc_number)`;

interface RawDocRow {
    id: string; doc_type: TaxDocumentRow["docType"]; source: TaxDocumentRow["source"];
    doc_number: string; supply_date: string; issued_on: string; user_id: string;
    invoice_id: string | null; rental_id: string | null; refund_id: string | null;
    original_document_id: string | null; gst_settings_id: string; recipient_name: string;
    place_of_supply: string; sac_code: string; gst_rate: number | string;
    taxable_amount: number | string; cgst_amount: number | string; sgst_amount: number | string;
    igst_amount: number | string; total_amount: number | string;
    lines: TaxDocumentLine[]; status: TaxDocumentRow["status"]; created_at: string; return_period: string;
    invoices: { invoice_number: string } | { invoice_number: string }[] | null;
    original: { doc_number: string } | { doc_number: string }[] | null;
}

const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;
const round2 = (n: number) => Math.round(n * 100) / 100;

function toDocRow(r: RawDocRow): TaxDocumentRow & { gstSettingsId: string } {
    return {
        id: r.id,
        docType: r.doc_type,
        source: r.source,
        docNumber: r.doc_number,
        supplyDate: r.supply_date,
        issuedOn: r.issued_on,
        userId: r.user_id,
        recipientName: r.recipient_name,
        invoiceId: r.invoice_id,
        billNumber: one(r.invoices)?.invoice_number ?? null,
        rentalId: r.rental_id,
        refundId: r.refund_id,
        originalDocumentId: r.original_document_id,
        originalDocNumber: one(r.original)?.doc_number ?? null,
        placeOfSupply: r.place_of_supply,
        sacCode: r.sac_code,
        gstRate: Number(r.gst_rate),
        taxableAmount: Number(r.taxable_amount),
        cgstAmount: Number(r.cgst_amount),
        sgstAmount: Number(r.sgst_amount),
        igstAmount: Number(r.igst_amount),
        totalAmount: Number(r.total_amount),
        status: r.status,
        lines: (r.lines ?? []).map((l) => ({
            description: l.description, sac: l.sac,
            gross: Number(l.gross), taxable: Number(l.taxable), cgst: Number(l.cgst), sgst: Number(l.sgst),
        })),
        createdAt: r.created_at,
        returnPeriod: r.return_period,
        gstSettingsId: r.gst_settings_id,
    };
}

/** PostgREST's or() grammar treats , ( ) as syntax — strip them from free text. */
const safeSearch = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

// ---------------------------------------------------------------------------
// GSTIN
// ---------------------------------------------------------------------------

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * The GSTIN's 15th character is a base-36 check digit over the first 14. A
 * mistyped GSTIN that still matches the format almost never passes this,
 * and an invoice printed under a wrong GSTIN gives the rider nothing.
 */
export function isValidGstinChecksum(gstin: string): boolean {
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) return false;
    let sum = 0;
    for (let i = 0; i < 14; i++) {
        const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
        sum += Math.floor(product / 36) + (product % 36);
    }
    return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

// ---------------------------------------------------------------------------
// GST profile
// ---------------------------------------------------------------------------

interface RawProfileRow {
    id: string; effective_from: string; legal_name: string; trade_name: string | null; gstin: string;
    state_code: string; state_name: string; address: string; sac_code: string; gst_rate: number | string;
    created_at: string;
}

function toProfileRow(r: RawProfileRow, inUse: boolean, currentId: string | null): GstProfileRow {
    return {
        id: r.id, effectiveFrom: r.effective_from, legalName: r.legal_name, tradeName: r.trade_name,
        gstin: r.gstin, stateCode: r.state_code, stateName: r.state_name, address: r.address,
        sacCode: r.sac_code, gstRate: Number(r.gst_rate), createdAt: r.created_at,
        inUse, isCurrent: r.id === currentId,
    };
}

export async function listGstProfiles(): Promise<GstProfileRow[]> {
    const { data, error } = await db
        .from("gst_settings")
        .select("id, effective_from, legal_name, trade_name, gstin, state_code, state_name, address, sac_code, gst_rate, created_at")
        .order("effective_from", { ascending: false });
    if (error) throw error;
    const rows = (data ?? []) as RawProfileRow[];

    const today = businessToday();
    const current = rows.find((r) => r.effective_from <= today) ?? null;

    const used = await Promise.all(rows.map(async (r) => {
        const { count, error: countError } = await db
            .from("tax_documents")
            .select("id", { count: "exact", head: true })
            .eq("gst_settings_id", r.id);
        if (countError) throw countError;
        return (count ?? 0) > 0;
    }));
    return rows.map((r, i) => toProfileRow(r, used[i], current?.id ?? null));
}

async function profileById(id: string): Promise<GstProfileRow> {
    const { data, error } = await db
        .from("gst_settings")
        .select("id, effective_from, legal_name, trade_name, gstin, state_code, state_name, address, sac_code, gst_rate, created_at")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("GST profile not found.");
    return toProfileRow(data as RawProfileRow, true, null);
}

/**
 * A change to the GST profile is a NEW row from a date — never an edit. The
 * date must be today or later and after every existing profile, so a
 * document already issued can never find itself under different terms.
 */
export async function createGstProfile(input: CreateGstProfileInput, actor: AuthContext): Promise<GstProfileRow> {
    if (!isValidGstinChecksum(input.gstin)) {
        throw badRequest("This GSTIN fails its check digit. Please re-check it against the registration certificate.", {
            gstin: "The GSTIN's last character does not match — check for a typing mistake.",
        });
    }
    const today = businessToday();
    if (input.effectiveFrom < today) {
        throw badRequest("A GST profile cannot start in the past.", { effectiveFrom: "Choose today or a later date." });
    }
    const { data: latest, error: latestError } = await db
        .from("gst_settings")
        .select("effective_from")
        .order("effective_from", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (latestError) throw latestError;
    if (latest && input.effectiveFrom <= (latest as { effective_from: string }).effective_from) {
        throw badRequest("A new profile must start after the latest one.", {
            effectiveFrom: `Choose a date after ${formatDocDate((latest as { effective_from: string }).effective_from)}.`,
        });
    }

    const { data, error } = await db
        .from("gst_settings")
        .insert({
            effective_from: input.effectiveFrom,
            legal_name: input.legalName,
            trade_name: input.tradeName ?? null,
            gstin: input.gstin,
            state_code: input.gstin.slice(0, 2),
            state_name: input.stateName,
            address: input.address,
            sac_code: input.sacCode,
            gst_rate: input.gstRate,
            created_by_user_id: actor.id,
        })
        .select("id")
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "gst.profile_added",
        entityType: "gst_settings", entityId: (data as { id: string }).id,
        after: { ...input },
    });
    return profileById((data as { id: string }).id);
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function listTaxDocuments(f: ListTaxDocumentsFilters): Promise<Paginated<TaxDocumentRow>> {
    let query = db
        .from("tax_documents")
        .select(DOC_COLUMNS, { count: "exact" })
        .gte("supply_date", f.from)
        .lte("supply_date", f.to);
    if (f.docType) query = query.eq("doc_type", f.docType);
    if (f.source) query = query.eq("source", f.source);
    if (f.search) {
        const s = safeSearch(f.search);
        if (s) query = query.or(`doc_number.ilike.%${s}%,recipient_name.ilike.%${s}%`);
    }
    const [from, to] = toRange(f);
    const { data, error, count } = await query
        .order("supply_date", { ascending: false })
        .order("doc_number", { ascending: false })
        .range(from, to);
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawDocRow[]).map(toDocRow), count ?? 0, f);
}

async function allDocumentsInRange(from: string, to: string): Promise<(TaxDocumentRow & { gstSettingsId: string })[]> {
    const rows: RawDocRow[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await db
            .from("tax_documents")
            .select(DOC_COLUMNS)
            .gte("supply_date", from)
            .lte("supply_date", to)
            .order("doc_type")
            .order("doc_number")
            .range(offset, offset + PAGE - 1);
        if (error) throw error;
        const batch = (data ?? []) as unknown as RawDocRow[];
        rows.push(...batch);
        if (batch.length < PAGE) break;
    }
    return rows.map(toDocRow);
}

function totalsOf(docs: TaxDocumentRow[]): TaxDocumentTotals {
    const live = docs.filter((d) => d.status === "issued");
    const numbers = live.map((d) => d.docNumber).sort();
    return {
        count: live.length,
        taxable: round2(live.reduce((s, d) => s + d.taxableAmount, 0)),
        cgst: round2(live.reduce((s, d) => s + d.cgstAmount, 0)),
        sgst: round2(live.reduce((s, d) => s + d.sgstAmount, 0)),
        total: round2(live.reduce((s, d) => s + d.totalAmount, 0)),
        firstNumber: numbers[0] ?? null,
        lastNumber: numbers[numbers.length - 1] ?? null,
    };
}

/** Pure — exported for tests. */
export function summarise(docs: TaxDocumentRow[], from: string, to: string): TaxDocumentSummary {
    const taxInvoices = totalsOf(docs.filter((d) => d.docType === "tax_invoice"));
    const creditNotes = totalsOf(docs.filter((d) => d.docType === "credit_note"));
    return {
        from, to, taxInvoices, creditNotes,
        net: {
            taxable: round2(taxInvoices.taxable - creditNotes.taxable),
            cgst: round2(taxInvoices.cgst - creditNotes.cgst),
            sgst: round2(taxInvoices.sgst - creditNotes.sgst),
            total: round2(taxInvoices.total - creditNotes.total),
        },
        cancelledCount: docs.filter((d) => d.status === "cancelled").length,
    };
}

export async function getTaxDocumentSummary(from: string, to: string): Promise<TaxDocumentSummary> {
    return summarise(await allDocumentsInRange(from, to), from, to);
}

async function getDocument(id: string): Promise<TaxDocumentRow & { gstSettingsId: string }> {
    const { data, error } = await db.from("tax_documents").select(DOC_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Tax document not found.");
    return toDocRow(data as unknown as RawDocRow);
}

export async function getTaxDocument(id: string): Promise<TaxDocumentRow> {
    const { gstSettingsId: _settings, ...row } = await getDocument(id);
    return row;
}

const pdfName = (docNumber: string) => `${docNumber.replace(/\//g, "-")}.pdf`;

export async function buildTaxDocumentPdf(id: string, ownerId?: string): Promise<{ filename: string; body: Buffer }> {
    const doc = await getDocument(id);
    // Rider access: not found, rather than forbidden, so ids cannot be probed.
    if (ownerId && doc.userId !== ownerId) throw notFound("Tax document not found.");
    const seller = await profileById(doc.gstSettingsId);
    return { filename: pdfName(doc.docNumber), body: await renderTaxDocumentPdf(doc, seller) };
}

// ---------------------------------------------------------------------------
// Exports — the "sales register" and "invoice copies" Taxkey asks for
// ---------------------------------------------------------------------------

const SOURCE_LABEL: Record<TaxDocumentRow["source"], string> = {
    invoice_paid: "Payment received",
    invoice_unpaid_30d: "Unpaid 30 days (Rule 47)",
    deposit_retained: "Deposit kept at return",
    refund: "Refund",
};

const REGISTER_COLUMNS: { header: string; width: number; value: (d: TaxDocumentRow) => string | number; money?: boolean }[] = [
    { header: "Document", width: 12, value: (d) => (d.docType === "tax_invoice" ? "Tax invoice" : "Credit note") },
    { header: "Number", width: 18, value: (d) => d.docNumber },
    { header: "Date", width: 12, value: (d) => d.issuedOn },
    { header: "Supply date", width: 12, value: (d) => d.supplyDate },
    { header: "Rider", width: 24, value: (d) => d.recipientName },
    { header: "Reason", width: 22, value: (d) => SOURCE_LABEL[d.source] },
    { header: "Bill / original", width: 18, value: (d) => d.originalDocNumber ?? d.billNumber ?? "" },
    { header: "Place of supply", width: 10, value: (d) => d.placeOfSupply },
    { header: "SAC", width: 8, value: (d) => d.sacCode },
    { header: "Rate %", width: 8, value: (d) => d.gstRate },
    { header: "Taxable value", width: 14, value: (d) => d.taxableAmount, money: true },
    { header: "CGST", width: 11, value: (d) => d.cgstAmount, money: true },
    { header: "SGST", width: 11, value: (d) => d.sgstAmount, money: true },
    { header: "IGST", width: 9, value: (d) => d.igstAmount, money: true },
    { header: "Total", width: 13, value: (d) => d.totalAmount, money: true },
    { header: "Status", width: 10, value: (d) => d.status },
];

/** Pure — exported for tests. */
export function renderRegisterCsv(docs: TaxDocumentRow[], summary: TaxDocumentSummary): Buffer {
    const esc = (v: unknown) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        `Swapngo GST register,${summary.from} to ${summary.to}`,
        `Net taxable value,${summary.net.taxable}`,
        `Net CGST,${summary.net.cgst}`,
        `Net SGST,${summary.net.sgst}`,
        "",
        REGISTER_COLUMNS.map((c) => esc(c.header)).join(","),
        ...docs.map((d) => REGISTER_COLUMNS.map((c) => esc(c.value(d))).join(",")),
    ];
    return Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(lines.join("\r\n"), "utf-8")]);
}

async function renderRegisterXlsx(docs: TaxDocumentRow[], summary: TaxDocumentSummary): Promise<Buffer> {
    const ExcelJSMod = await import("exceljs");
    const ExcelJS = (ExcelJSMod as unknown as { default?: typeof ExcelJSMod }).default ?? ExcelJSMod;
    const wb = new ExcelJS.Workbook();
    wb.creator = "SwapNgo";
    const MONEY = "#,##0.00";

    const s = wb.addWorksheet("Summary");
    s.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 22 }, { width: 22 }];
    s.addRow([`GST register · ${summary.from} to ${summary.to}`]).font = { bold: true, size: 13 };
    s.addRow([]);
    const head = s.addRow(["", "Count", "Taxable value", "CGST", "SGST", "First number", "Last number"]);
    head.font = { bold: true };
    const block = (label: string, t: TaxDocumentTotals) =>
        s.addRow([label, t.count, t.taxable, t.cgst, t.sgst, t.firstNumber ?? "", t.lastNumber ?? ""]);
    block("Tax invoices", summary.taxInvoices);
    block("Credit notes", summary.creditNotes);
    const net = s.addRow(["Net (GSTR-1 Table 7 / GSTR-3B 3.1(a))", "", summary.net.taxable, summary.net.cgst, summary.net.sgst]);
    net.font = { bold: true };
    s.addRow([]);
    s.addRow([`Supplies are B2C, intra-state Tamil Nadu (33), SAC ${docs[0]?.sacCode ?? "9973"}.`]);
    if (summary.cancelledCount) s.addRow([`${summary.cancelledCount} cancelled document(s) excluded from totals.`]);
    for (const r of [4, 5, 6]) for (const c of [3, 4, 5]) s.getRow(r).getCell(c).numFmt = MONEY;

    const reg = wb.addWorksheet("Register");
    reg.columns = REGISTER_COLUMNS.map((c) => ({ header: c.header, width: c.width }));
    reg.getRow(1).font = { bold: true };
    reg.views = [{ state: "frozen", ySplit: 1 }];
    for (const d of docs) reg.addRow(REGISTER_COLUMNS.map((c) => c.value(d)));
    REGISTER_COLUMNS.forEach((c, i) => {
        if (c.money) reg.getColumn(i + 1).numFmt = MONEY;
    });

    const lines = wb.addWorksheet("Lines");
    lines.columns = [
        { header: "Number", width: 18 }, { header: "Description", width: 60 }, { header: "SAC", width: 8 },
        { header: "Taxable value", width: 14 }, { header: "CGST", width: 11 }, { header: "SGST", width: 11 },
        { header: "Amount", width: 13 },
    ];
    lines.getRow(1).font = { bold: true };
    for (const d of docs) {
        for (const l of d.lines) lines.addRow([d.docNumber, l.description, l.sac, l.taxable, l.cgst, l.sgst, l.gross]);
    }
    for (const i of [4, 5, 6, 7]) lines.getColumn(i).numFmt = MONEY;

    return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function buildRegisterExport(
    from: string, to: string, format: "xlsx" | "csv",
): Promise<{ filename: string; contentType: string; body: Buffer }> {
    const docs = await allDocumentsInRange(from, to);
    const summary = summarise(docs, from, to);
    const base = `swapngo-gst-register_${from}_to_${to}`;
    if (format === "csv") {
        return { filename: `${base}.csv`, contentType: "text/csv; charset=utf-8", body: renderRegisterCsv(docs, summary) };
    }
    return {
        filename: `${base}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: await renderRegisterXlsx(docs, summary),
    };
}

/** Hard ceiling on one ZIP, so a careless date range cannot exhaust the backend's memory. */
const MAX_DOCS_PER_ZIP = 1500;

export async function buildPdfZip(from: string, to: string): Promise<{ filename: string; body: Buffer }> {
    const docs = await allDocumentsInRange(from, to);
    if (docs.length === 0) throw businessRule("There are no tax documents in this date range.");
    if (docs.length > MAX_DOCS_PER_ZIP) {
        throw businessRule(`This range has ${docs.length} documents; download at most ${MAX_DOCS_PER_ZIP} at a time (try one month).`);
    }
    const profiles = new Map<string, GstProfileRow>();
    const zip = new JSZip();
    for (const doc of docs) {
        let seller = profiles.get(doc.gstSettingsId);
        if (!seller) {
            seller = await profileById(doc.gstSettingsId);
            profiles.set(doc.gstSettingsId, seller);
        }
        const folder = doc.docType === "tax_invoice" ? "tax-invoices" : "credit-notes";
        // Sequential on purpose: pdfkit is CPU-bound and the free-tier
        // backend has half a CPU; a parallel burst only adds memory pressure.
        // eslint-disable-next-line no-await-in-loop
        zip.file(`${folder}/${pdfName(doc.docNumber)}`, await renderTaxDocumentPdf(doc, seller));
    }
    return {
        filename: `swapngo-gst-documents_${from}_to_${to}.zip`,
        body: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
    };
}

/** Every document REPORTED in a GSTR-1 month (its return_period), for the filing pack. */
export async function documentsForReturn(month: string): Promise<TaxDocumentRow[]> {
    const rows: RawDocRow[] = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await db.from("tax_documents").select(DOC_COLUMNS)
            .eq("return_period", `${month}-01`).order("doc_type").order("doc_number").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...((data ?? []) as unknown as RawDocRow[]));
        if ((data ?? []).length < 1000) break;
    }
    return rows.map(toDocRow);
}

/** Adds the PDFs of every document reported in a month to an existing ZIP, under `prefix`. */
export async function addReturnPdfsToZip(zip: JSZip, month: string, prefix: string): Promise<number> {
    const docs = (await documentsForReturn(month)) as (TaxDocumentRow & { gstSettingsId: string })[];
    if (docs.length > MAX_DOCS_PER_ZIP) throw businessRule(`This month has ${docs.length} documents — more than one pack can hold.`);
    const profiles = new Map<string, GstProfileRow>();
    for (const doc of docs) {
        let seller = profiles.get(doc.gstSettingsId);
        if (!seller) {
            seller = await profileById(doc.gstSettingsId);
            profiles.set(doc.gstSettingsId, seller);
        }
        const folder = doc.docType === "tax_invoice" ? "tax-invoices" : "credit-notes";
        // eslint-disable-next-line no-await-in-loop -- sequential on purpose, see buildPdfZip
        zip.file(`${prefix}${folder}/${pdfName(doc.docNumber)}`, await renderTaxDocumentPdf(doc, seller));
    }
    return docs.length;
}

/** The register workbook for documents reported in a return month. */
export async function buildReturnRegisterXlsx(month: string): Promise<Buffer> {
    const docs = await documentsForReturn(month);
    const [y, m] = month.split("-").map(Number);
    const to = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    return renderRegisterXlsx(docs, summarise(docs, `${month}-01`, to));
}

// ---------------------------------------------------------------------------
// Pending documents and the catch-up sweep
// ---------------------------------------------------------------------------

export async function getPendingTaxDocuments(): Promise<PendingTaxDocuments> {
    const [{ data: pending, error: pendingError }, { data: failures, error: failuresError }] = await Promise.all([
        db.rpc("pending_tax_documents"),
        db.from("audit_logs")
            .select("created_at, entity_type, entity_id, after_data")
            .eq("action", "tax_document.issue_failed")
            .gte("created_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
            .order("created_at", { ascending: false })
            .limit(20),
    ]);
    if (pendingError) throw pendingError;
    if (failuresError) throw failuresError;

    const rows = (pending ?? []) as { kind: keyof PendingTaxDocuments["byKind"] }[];
    const byKind = { paid: 0, unpaid: 0, kept: 0, refund: 0 };
    for (const r of rows) if (r.kind in byKind) byKind[r.kind] += 1;
    return {
        total: rows.length,
        byKind,
        recentFailures: ((failures ?? []) as { created_at: string; entity_type: string; entity_id: string; after_data: { error?: string } | null }[])
            .map((f) => ({ at: f.created_at, entityType: f.entity_type, entityId: f.entity_id, error: f.after_data?.error ?? "" })),
    };
}

/** Runs the same sweep the daily job runs, now. Idempotent. */
export async function issuePendingTaxDocuments(actor: AuthContext): Promise<{ issued: number }> {
    const { data, error } = await db.rpc("issue_pending_tax_documents", { p_backfill: false });
    if (error) throw error;
    const issued = Number(data ?? 0);
    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "tax_document.sweep_run",
        entityType: "tax_documents", entityId: "sweep", after: { issued },
    });
    return { issued };
}

// ---------------------------------------------------------------------------
// Rider
// ---------------------------------------------------------------------------

export async function listMyTaxDocuments(
    userId: string, page: { page: number; pageSize: number },
): Promise<Paginated<TaxDocumentRow>> {
    const [from, to] = toRange(page);
    const { data, error, count } = await db
        .from("tax_documents")
        .select(DOC_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "issued")
        .order("supply_date", { ascending: false })
        .order("doc_number", { ascending: false })
        .range(from, to);
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawDocRow[]).map((r) => {
        const { gstSettingsId: _s, ...row } = toDocRow(r);
        return row;
    }), count ?? 0, page);
}

/**
 * The rider app opens a PDF in the system browser, which cannot send our
 * bearer token. So the authenticated app asks for a short-lived link instead:
 * an HMAC-signed token naming the document, its owner and an expiry, verified
 * by the one unauthenticated route that serves it. The signing key is
 * derived from the service-role key with a fixed label, so no new secret has
 * to be configured and the derived key is useless for anything else.
 */
const LINK_TTL_SECONDS = 10 * 60;
const linkKey = () => createHmac("sha256", env.supabaseServiceKey).update("swapngo:gst-document-link:v1").digest();
const b64url = (b: Buffer) => b.toString("base64url");

export async function createMyDocumentLink(userId: string, docId: string): Promise<{ path: string; expiresAt: string }> {
    const doc = await getDocument(docId);
    if (doc.userId !== userId || doc.status !== "issued") throw notFound("Tax document not found.");
    const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
    const payload = b64url(Buffer.from(JSON.stringify({ d: docId, u: userId, e: exp })));
    const sig = b64url(createHmac("sha256", linkKey()).update(payload).digest());
    return { path: `/gst/public/documents/${payload}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Pure apart from the clock — exported for tests. Returns the document id, or null. */
export function verifyDocumentLinkToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): { docId: string; userId: string } | null {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expected = createHmac("sha256", linkKey()).update(payload).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
        const { d, u, e } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { d: string; u: string; e: number };
        if (typeof d !== "string" || typeof u !== "string" || typeof e !== "number" || e < nowSeconds) return null;
        return { docId: d, userId: u };
    } catch {
        return null;
    }
}
