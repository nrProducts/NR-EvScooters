import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { badRequest, businessRule, conflict, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import { paginate, toRange } from "../../common/pagination";
import type { AuthContext, Paginated } from "../../types";
import { isValidGstinChecksum } from "../gst/gst.service";
import { detectMime, type AllowedMime } from "../kyc/kyc.storage";
import { categoryOf, reverseChargeIgst, splitPurchaseTax, type ItcStatus } from "./purchases.itc";

/**
 * Stage 4 — purchases and input tax credit
 * (supabase/migrations/20261103130000_purchases_itc.sql).
 *
 * A bill is entered as a draft with its lines and its file, confirmed once
 * checked, and from then on changed only by cancelling it. ITC is claimed
 * from confirmed bills in the month set on them, eligible lines only, and
 * only once GSTR-2B shows the supplier filed (reverse charge needs no 2B).
 *
 * The tables are not in the generated types yet, hence the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;
const BUCKET = "finance-documents";
const round2 = (n: number) => Math.round(n * 100) / 100;
const one = <T,>(raw: T | T[] | null | undefined): T | null => (Array.isArray(raw) ? raw[0] : raw) ?? null;
const safeSearch = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export interface VendorRow {
    id: string; name: string; gstin: string | null; pan: string | null; stateCode: string | null;
    address: string | null; kind: string; defaultCategory: string | null;
    contactEmail: string | null; contactPhone: string | null; isActive: boolean;
}

const VENDOR_COLUMNS = "id, name, gstin, pan, state_code, address, kind, default_category, contact_email, contact_phone, is_active";

interface RawVendor {
    id: string; name: string; gstin: string | null; pan: string | null; state_code: string | null;
    address: string | null; kind: string; default_category: string | null;
    contact_email: string | null; contact_phone: string | null; is_active: boolean;
}

const toVendor = (v: RawVendor): VendorRow => ({
    id: v.id, name: v.name, gstin: v.gstin, pan: v.pan, stateCode: v.state_code, address: v.address,
    kind: v.kind, defaultCategory: v.default_category, contactEmail: v.contact_email,
    contactPhone: v.contact_phone, isActive: v.is_active,
});

export async function listVendors(search?: string): Promise<VendorRow[]> {
    let q = db.from("vendors").select(VENDOR_COLUMNS).is("deleted_at", null).order("name");
    if (search) {
        const s = safeSearch(search);
        if (s) q = q.or(`name.ilike.%${s}%,gstin.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as RawVendor[]).map(toVendor);
}

export interface VendorInput {
    name: string; gstin?: string | null; pan?: string | null; address?: string | null;
    kind: string; defaultCategory?: string | null; contactEmail?: string | null; contactPhone?: string | null;
    stateCode?: string | null;
}

function vendorFields(input: VendorInput) {
    const gstin = input.gstin?.trim().toUpperCase() || null;
    if (gstin && !isValidGstinChecksum(gstin)) {
        throw badRequest("This GSTIN fails its check digit.", { gstin: "Check the GSTIN against the vendor's invoice — the last character does not match." });
    }
    if (input.defaultCategory && !categoryOf(input.defaultCategory)) throw badRequest("Unknown default category.");
    return {
        name: input.name.trim(),
        gstin,
        // The GSTIN's first two digits ARE the state; without one, what the user gave.
        state_code: gstin ? gstin.slice(0, 2) : input.stateCode ?? null,
        pan: input.pan?.trim().toUpperCase() || (gstin ? gstin.slice(2, 12) : null),
        address: input.address?.trim() || null,
        kind: input.kind,
        default_category: input.defaultCategory ?? null,
        contact_email: input.contactEmail?.trim() || null,
        contact_phone: input.contactPhone?.trim() || null,
    };
}

export async function createVendor(input: VendorInput, actor: AuthContext): Promise<VendorRow> {
    const { data, error } = await db.from("vendors").insert(vendorFields(input)).select(VENDOR_COLUMNS).single();
    if (error) {
        if ((error as { code?: string }).code === "23505") throw conflict("A vendor with this name already exists.");
        throw error;
    }
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.vendor_saved", entityType: "vendor", entityId: (data as RawVendor).id, after: { ...input } });
    return toVendor(data as RawVendor);
}

export async function updateVendor(id: string, input: VendorInput, actor: AuthContext): Promise<VendorRow> {
    const { data, error } = await db.from("vendors").update(vendorFields(input)).eq("id", id).select(VENDOR_COLUMNS).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Vendor not found.");
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.vendor_saved", entityType: "vendor", entityId: id, after: { ...input } });
    return toVendor(data as RawVendor);
}

async function findOrCreateVendor(name: string, fields: Partial<VendorInput> & { kind: string }): Promise<RawVendor> {
    const { data } = await db.from("vendors").select(VENDOR_COLUMNS).ilike("name", name).maybeSingle();
    if (data) return data as RawVendor;
    const { data: created, error } = await db.from("vendors")
        .insert({ name, kind: fields.kind, gstin: fields.gstin ?? null, state_code: fields.gstin?.slice(0, 2) ?? fields.stateCode ?? null, default_category: fields.defaultCategory ?? null })
        .select(VENDOR_COLUMNS).single();
    if (error) throw error;
    return created as RawVendor;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export interface BillLineInput {
    description: string; category: string; taxableAmount: number; gstRate: number;
    itcStatus?: ItcStatus; itcReason?: string | null; isCapital?: boolean;
    /** Override the computed heads — e.g. to match the vendor's invoice to the paisa. */
    cgstAmount?: number; sgstAmount?: number; igstAmount?: number;
}

export interface BillInput {
    vendorId: string; billNumber: string; billDate: string; itcMonth?: string | null;
    isReverseCharge?: boolean; notes?: string | null; lines: BillLineInput[];
}

export interface BillLineRow {
    id: string; lineNo: number; description: string; category: string; categoryLabel: string;
    taxableAmount: number; gstRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number;
    totalAmount: number; itcStatus: ItcStatus; itcReason: string | null; isCapital: boolean;
    /** Reverse-charge IGST Swapngo owes on this line (0 unless the bill is reverse charge). */
    reverseChargeIgst: number;
}

export interface BillRow {
    id: string; vendorId: string; vendorName: string; vendorGstin: string | null;
    billNumber: string; billDate: string; placeOfSupply: string; isReverseCharge: boolean;
    taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalAmount: number;
    itcMonth: string | null; status: "draft" | "confirmed" | "cancelled"; source: string;
    gstr2bStatus: string; hasFile: boolean; notes: string | null;
    paidAmount: number; createdAt: string;
}

export interface BillDetail extends BillRow {
    lines: BillLineRow[];
    payments: { lineId: string; date: string | null; amount: number; description: string | null }[];
    cancelReason: string | null;
}

const BILL_COLUMNS = `id, vendor_id, bill_number, bill_date, place_of_supply, is_reverse_charge, taxable_amount,
    cgst_amount, sgst_amount, igst_amount, total_amount, itc_month, status, source, gstr2b_status, file_path,
    notes, cancel_reason, created_at, vendors(name, gstin)`;

interface RawBill {
    id: string; vendor_id: string; bill_number: string; bill_date: string; place_of_supply: string;
    is_reverse_charge: boolean; taxable_amount: number | string; cgst_amount: number | string;
    sgst_amount: number | string; igst_amount: number | string; total_amount: number | string;
    itc_month: string | null; status: BillRow["status"]; source: string; gstr2b_status: string;
    file_path: string | null; notes: string | null; cancel_reason: string | null; created_at: string;
    vendors: unknown;
}

function toBillRow(b: RawBill, paid: number): BillRow {
    const v = one(b.vendors as { name: string; gstin: string | null } | null);
    return {
        id: b.id, vendorId: b.vendor_id, vendorName: v?.name ?? "—", vendorGstin: v?.gstin ?? null,
        billNumber: b.bill_number, billDate: b.bill_date, placeOfSupply: b.place_of_supply,
        isReverseCharge: b.is_reverse_charge, taxableAmount: Number(b.taxable_amount),
        cgstAmount: Number(b.cgst_amount), sgstAmount: Number(b.sgst_amount), igstAmount: Number(b.igst_amount),
        totalAmount: Number(b.total_amount), itcMonth: b.itc_month, status: b.status, source: b.source,
        gstr2bStatus: b.gstr2b_status, hasFile: !!b.file_path, notes: b.notes, paidAmount: round2(paid),
        createdAt: b.created_at,
    };
}

async function paidByBill(billIds: string[]): Promise<Map<string, number>> {
    const paid = new Map<string, number>();
    if (billIds.length === 0) return paid;
    const { data, error } = await db.from("external_statement_lines").select("purchase_bill_id, amount")
        .eq("source", "hdfc").in("purchase_bill_id", billIds);
    if (error) throw error;
    for (const r of (data ?? []) as { purchase_bill_id: string; amount: number | string }[]) {
        paid.set(r.purchase_bill_id, (paid.get(r.purchase_bill_id) ?? 0) + Math.abs(Number(r.amount)));
    }
    return paid;
}

export async function listBills(f: {
    from: string; to: string; status?: string; vendorId?: string; search?: string; page: number; pageSize: number;
}): Promise<Paginated<BillRow>> {
    let q = db.from("purchase_bills").select(BILL_COLUMNS, { count: "exact" })
        .gte("bill_date", f.from).lte("bill_date", f.to);
    if (f.status) q = q.eq("status", f.status);
    if (f.vendorId) q = q.eq("vendor_id", f.vendorId);
    if (f.search) {
        const s = safeSearch(f.search);
        if (s) q = q.ilike("bill_number", `%${s}%`);
    }
    const [from, to] = toRange(f);
    const { data, error, count } = await q.order("bill_date", { ascending: false }).order("created_at", { ascending: false }).range(from, to);
    if (error) throw error;
    const rows = (data ?? []) as unknown as RawBill[];
    const paid = await paidByBill(rows.map((r) => r.id));
    return paginate(rows.map((r) => toBillRow(r, paid.get(r.id) ?? 0)), count ?? 0, f);
}

interface RawBillLine {
    id: string; line_no: number; description: string; category: string; taxable_amount: number | string;
    gst_rate: number | string; cgst_amount: number | string; sgst_amount: number | string;
    igst_amount: number | string; total_amount: number | string; itc_status: ItcStatus;
    itc_reason: string | null; is_capital: boolean;
}

export async function getBill(id: string): Promise<BillDetail> {
    const { data, error } = await db.from("purchase_bills").select(BILL_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Bill not found.");
    const bill = data as unknown as RawBill;

    const [{ data: lines, error: linesError }, { data: payments, error: paymentsError }] = await Promise.all([
        db.from("purchase_bill_lines").select("id, line_no, description, category, taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, total_amount, itc_status, itc_reason, is_capital")
            .eq("bill_id", id).order("line_no"),
        db.from("external_statement_lines").select("id, value_date, amount, description")
            .eq("source", "hdfc").eq("purchase_bill_id", id).order("value_date"),
    ]);
    if (linesError) throw linesError;
    if (paymentsError) throw paymentsError;

    const pays = (payments ?? []) as { id: string; value_date: string | null; amount: number | string; description: string | null }[];
    return {
        ...toBillRow(bill, pays.reduce((s, p) => s + Math.abs(Number(p.amount)), 0)),
        cancelReason: bill.cancel_reason,
        lines: ((lines ?? []) as RawBillLine[]).map((l) => ({
            id: l.id, lineNo: l.line_no, description: l.description, category: l.category,
            categoryLabel: categoryOf(l.category)?.label ?? l.category,
            taxableAmount: Number(l.taxable_amount), gstRate: Number(l.gst_rate),
            cgstAmount: Number(l.cgst_amount), sgstAmount: Number(l.sgst_amount), igstAmount: Number(l.igst_amount),
            totalAmount: Number(l.total_amount), itcStatus: l.itc_status, itcReason: l.itc_reason,
            isCapital: l.is_capital,
            reverseChargeIgst: bill.is_reverse_charge && l.itc_status !== "ineligible"
                ? reverseChargeIgst(Number(l.taxable_amount), Number(l.gst_rate)) : 0,
        })),
        payments: pays.map((p) => ({ lineId: p.id, date: p.value_date, amount: Math.abs(Number(p.amount)), description: p.description })),
    };
}

/** Pure — the line rows a bill input becomes. Exported for tests. */
export function buildLineRows(
    billId: string, lines: BillLineInput[], vendor: { state_code: string | null }, reverseCharge: boolean,
): Record<string, unknown>[] {
    if (lines.length === 0) throw badRequest("A bill needs at least one line.");
    return lines.map((l, i) => {
        const category = categoryOf(l.category);
        if (!category) throw badRequest(`Line ${i + 1}: unknown category.`);
        const computed = splitPurchaseTax(l.taxableAmount, l.gstRate, { supplierState: vendor.state_code, reverseCharge });
        const cgst = round2(l.cgstAmount ?? computed.cgst);
        const sgst = round2(l.sgstAmount ?? computed.sgst);
        const igst = round2(l.igstAmount ?? computed.igst);
        if (igst > 0 && (cgst > 0 || sgst > 0)) throw badRequest(`Line ${i + 1}: a line is either IGST or CGST + SGST, not both.`);
        const status = l.itcStatus ?? category.itc;
        if (status !== category.itc && !l.itcReason?.trim()) {
            throw badRequest(`Line ${i + 1}: changing the ITC status from "${category.itc}" needs a reason.`);
        }
        return {
            bill_id: billId,
            line_no: i + 1,
            description: l.description.trim(),
            category: l.category,
            taxable_amount: round2(l.taxableAmount),
            gst_rate: l.gstRate,
            cgst_amount: cgst, sgst_amount: sgst, igst_amount: igst,
            total_amount: round2(l.taxableAmount + cgst + sgst + igst),
            itc_status: status,
            itc_reason: status !== category.itc ? l.itcReason!.trim() : category.basis,
            is_capital: l.isCapital ?? !!category.capital,
        };
    });
}

async function vendorById(id: string): Promise<RawVendor> {
    const { data, error } = await db.from("vendors").select(VENDOR_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw badRequest("Choose a vendor.", { vendorId: "Choose a vendor." });
    return data as RawVendor;
}

const monthStart = (day: string) => `${day.slice(0, 7)}-01`;

export async function createBill(input: BillInput, actor: AuthContext, source = "manual"): Promise<BillDetail> {
    const vendor = await vendorById(input.vendorId);
    const reverseCharge = input.isReverseCharge ?? vendor.kind === "foreign_software";
    const { data: bill, error } = await db.from("purchase_bills")
        .insert({
            vendor_id: vendor.id,
            bill_number: input.billNumber.trim(),
            bill_date: input.billDate,
            is_reverse_charge: reverseCharge,
            itc_month: input.itcMonth ? monthStart(input.itcMonth) : monthStart(input.billDate),
            notes: input.notes?.trim() || null,
            source,
            gstr2b_status: reverseCharge ? "not_applicable" : "not_checked",
            created_by_user_id: actor.id,
        })
        .select("id").single();
    if (error) {
        if ((error as { code?: string }).code === "23505") throw conflict("This vendor's bill with that number is already entered.");
        throw error;
    }
    const billId = (bill as { id: string }).id;
    const { error: linesError } = await db.from("purchase_bill_lines").insert(buildLineRows(billId, input.lines, vendor, reverseCharge));
    if (linesError) {
        await db.from("purchase_bills").delete().eq("id", billId);
        throw linesError;
    }
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_created", entityType: "purchase_bill", entityId: billId, after: { vendor: vendor.name, bill_number: input.billNumber, lines: input.lines.length, source } });
    return getBill(billId);
}

export async function updateDraftBill(id: string, input: BillInput, actor: AuthContext): Promise<BillDetail> {
    const existing = await getBill(id);
    if (existing.status !== "draft") throw businessRule("Only a draft bill can be edited. Cancel a confirmed bill and enter a corrected one.");
    const vendor = await vendorById(input.vendorId);
    const reverseCharge = input.isReverseCharge ?? vendor.kind === "foreign_software";
    const { error } = await db.from("purchase_bills").update({
        vendor_id: vendor.id, bill_number: input.billNumber.trim(), bill_date: input.billDate,
        is_reverse_charge: reverseCharge,
        itc_month: input.itcMonth ? monthStart(input.itcMonth) : monthStart(input.billDate),
        notes: input.notes?.trim() || null,
        gstr2b_status: reverseCharge ? "not_applicable" : "not_checked",
    }).eq("id", id).eq("status", "draft");
    if (error) {
        if ((error as { code?: string }).code === "23505") throw conflict("This vendor's bill with that number is already entered.");
        throw error;
    }
    const { error: delError } = await db.from("purchase_bill_lines").delete().eq("bill_id", id);
    if (delError) throw delError;
    const { error: insError } = await db.from("purchase_bill_lines").insert(buildLineRows(id, input.lines, vendor, reverseCharge));
    if (insError) throw insError;
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_updated", entityType: "purchase_bill", entityId: id, after: { lines: input.lines.length } });
    return getBill(id);
}

export async function confirmBill(id: string, actor: AuthContext): Promise<BillDetail> {
    const bill = await getBill(id);
    if (bill.status !== "draft") throw businessRule("This bill is not a draft.");
    if (bill.lines.length === 0) throw businessRule("Add at least one line before confirming.");
    const { error } = await db.from("purchase_bills")
        .update({ status: "confirmed", confirmed_at: new Date().toISOString() }).eq("id", id).eq("status", "draft");
    if (error) throw error;
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_confirmed", entityType: "purchase_bill", entityId: id, after: { total: bill.totalAmount, itc_month: bill.itcMonth } });
    return getBill(id);
}

export async function cancelBill(id: string, reason: string, actor: AuthContext): Promise<BillDetail> {
    const bill = await getBill(id);
    if (bill.status === "cancelled") throw businessRule("This bill is already cancelled.");
    const { error } = await db.from("purchase_bills")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: reason })
        .eq("id", id).neq("status", "cancelled");
    if (error) throw error;
    await db.from("external_statement_lines").update({ purchase_bill_id: null }).eq("purchase_bill_id", id);
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_cancelled", entityType: "purchase_bill", entityId: id, before: { status: bill.status }, after: { reason } });
    return getBill(id);
}

const EXTENSION: Record<AllowedMime, string> = { "image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf" };

export async function uploadBillFile(id: string, file: { buffer: Buffer; size: number }, actor: AuthContext): Promise<BillDetail> {
    const bill = await getBill(id);
    if (bill.status === "cancelled") throw businessRule("This bill is cancelled.");
    if (file.size > 10 * 1024 * 1024) throw badRequest("The file must be 10 MB or smaller.");
    const mime = detectMime(file.buffer);
    if (!mime) throw badRequest("Upload the bill as a PDF, JPEG or PNG.");
    const path = `bills/${id}/${randomUUID()}.${EXTENSION[mime]}`;
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(path, file.buffer, { contentType: mime, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await db.from("purchase_bills").update({ file_path: path }).eq("id", id);
    if (error) throw error;
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_file_uploaded", entityType: "purchase_bill", entityId: id, after: { path } });
    return getBill(id);
}

export async function billFileUrl(id: string): Promise<{ url: string }> {
    const { data, error } = await db.from("purchase_bills").select("file_path").eq("id", id).maybeSingle();
    if (error) throw error;
    const path = (data as { file_path: string | null } | null)?.file_path;
    if (!path) throw notFound("No file is attached to this bill.");
    const { data: signed, error: signError } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 300);
    if (signError) throw signError;
    return { url: signed.signedUrl };
}

// ---------------------------------------------------------------------------
// Paying bills — a bank debit linked to the bill it paid
// ---------------------------------------------------------------------------

export async function linkPayment(billId: string, bankLineId: string, actor: AuthContext): Promise<BillDetail> {
    const bill = await getBill(billId);
    if (bill.status !== "confirmed") throw businessRule("Confirm the bill before linking its payment.");
    const { data: line, error } = await db.from("external_statement_lines").select("id, source, kind, amount, purchase_bill_id")
        .eq("id", bankLineId).maybeSingle();
    if (error) throw error;
    const l = line as { source: string; kind: string; amount: number | string; purchase_bill_id: string | null } | null;
    if (!l || l.source !== "hdfc" || l.kind !== "bank_debit") throw badRequest("Choose a money-out line from an imported bank statement.");
    if (l.purchase_bill_id && l.purchase_bill_id !== billId) throw conflict("That bank payment is already linked to another bill.");
    const { error: updateError } = await db.from("external_statement_lines").update({ purchase_bill_id: billId }).eq("id", bankLineId);
    if (updateError) throw updateError;
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_payment_linked", entityType: "purchase_bill", entityId: billId, after: { bank_line_id: bankLineId, amount: Math.abs(Number(l.amount)) } });
    return getBill(billId);
}

export async function unlinkPayment(billId: string, bankLineId: string, actor: AuthContext): Promise<BillDetail> {
    const { error } = await db.from("external_statement_lines").update({ purchase_bill_id: null })
        .eq("id", bankLineId).eq("purchase_bill_id", billId);
    if (error) throw error;
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.bill_payment_unlinked", entityType: "purchase_bill", entityId: billId, after: { bank_line_id: bankLineId } });
    return getBill(billId);
}

/** Bank debits not yet linked to a bill, near the bill's amount, for the "link payment" picker. */
export async function paymentCandidates(billId: string): Promise<{ id: string; date: string | null; amount: number; description: string | null; counterparty: string | null }[]> {
    const bill = await getBill(billId);
    const { data, error } = await db.from("external_statement_lines")
        .select("id, value_date, amount, description, counterparty_key")
        .eq("source", "hdfc").eq("kind", "bank_debit").is("purchase_bill_id", null)
        .gte("value_date", bill.billDate)
        .order("value_date").limit(200);
    if (error) throw error;
    const outstanding = bill.totalAmount - bill.paidAmount;
    return ((data ?? []) as { id: string; value_date: string | null; amount: number | string; description: string | null; counterparty_key: string | null }[])
        .map((r) => ({ id: r.id, date: r.value_date, amount: Math.abs(Number(r.amount)), description: r.description, counterparty: r.counterparty_key }))
        .sort((a, b) => Math.abs(a.amount - outstanding) - Math.abs(b.amount - outstanding))
        .slice(0, 25);
}

export interface PayableRow extends BillRow {
    outstanding: number; ageDays: number;
    /** Unpaid 150+ days with ITC claimed: Rule 37 reverses it at 180. */
    rule37Warning: boolean;
}

export async function listPayables(): Promise<PayableRow[]> {
    const { data, error } = await db.from("purchase_bills").select(BILL_COLUMNS).eq("status", "confirmed").order("bill_date");
    if (error) throw error;
    const rows = (data ?? []) as unknown as RawBill[];
    const paid = await paidByBill(rows.map((r) => r.id));
    const today = businessToday();
    const ageOf = (d: string) => Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / 86_400_000);
    return rows
        .map((r) => toBillRow(r, paid.get(r.id) ?? 0))
        .filter((b) => b.totalAmount - b.paidAmount > 0.009)
        .map((b) => {
            const ageDays = ageOf(b.billDate);
            const hasItc = b.cgstAmount + b.sgstAmount + b.igstAmount > 0;
            return { ...b, outstanding: round2(b.totalAmount - b.paidAmount), ageDays, rule37Warning: hasItc && ageDays >= 150 };
        });
}

// ---------------------------------------------------------------------------
// ITC for a return month
// ---------------------------------------------------------------------------

export interface ItcMonthSummary {
    month: string;
    /** In GSTR-2B (or reverse charge) — claim in GSTR-3B 4A. */
    eligible: { cgst: number; sgst: number; igst: number };
    /** Eligible lines whose supplier has not filed yet — carried forward. */
    awaiting2b: { cgst: number; sgst: number; igst: number; bills: number };
    /** s. 17(5) — shown in 4A then reversed in 4B(1). */
    blocked: { cgst: number; sgst: number; igst: number };
    review: { cgst: number; sgst: number; igst: number; lines: number };
    /** Reverse charge: IGST owed in cash (3.1(d)) and claimed back (4A(3)). */
    reverseCharge: { taxable: number; igst: number; bills: number };
    billCount: number;
    drafts: number;
}

export async function getItcSummary(month: string): Promise<ItcMonthSummary> {
    const start = `${month}-01`;
    const [{ data, error }, { count: drafts, error: draftError }] = await Promise.all([
        db.from("purchase_bills")
            .select("id, is_reverse_charge, gstr2b_status, purchase_bill_lines(taxable_amount, gst_rate, cgst_amount, sgst_amount, igst_amount, itc_status)")
            .eq("status", "confirmed").eq("itc_month", start),
        db.from("purchase_bills").select("id", { count: "exact", head: true }).eq("status", "draft").eq("itc_month", start),
    ]);
    if (error) throw error;
    if (draftError) throw draftError;

    const zero = () => ({ cgst: 0, sgst: 0, igst: 0 });
    const s: ItcMonthSummary = {
        month, eligible: zero(), awaiting2b: { ...zero(), bills: 0 }, blocked: zero(),
        review: { ...zero(), lines: 0 }, reverseCharge: { taxable: 0, igst: 0, bills: 0 },
        billCount: 0, drafts: drafts ?? 0,
    };
    const add = (into: { cgst: number; sgst: number; igst: number }, l: { cgst_amount: number | string; sgst_amount: number | string; igst_amount: number | string }) => {
        into.cgst = round2(into.cgst + Number(l.cgst_amount));
        into.sgst = round2(into.sgst + Number(l.sgst_amount));
        into.igst = round2(into.igst + Number(l.igst_amount));
    };

    for (const bill of (data ?? []) as { is_reverse_charge: boolean; gstr2b_status: string; purchase_bill_lines: unknown }[]) {
        s.billCount++;
        const lines = (bill.purchase_bill_lines ?? []) as { taxable_amount: number | string; gst_rate: number | string; cgst_amount: number | string; sgst_amount: number | string; igst_amount: number | string; itc_status: ItcStatus }[];
        if (bill.is_reverse_charge) {
            let rcm = 0;
            let taxable = 0;
            for (const l of lines) {
                if (l.itc_status === "ineligible") continue;
                const igst = reverseChargeIgst(Number(l.taxable_amount), Number(l.gst_rate));
                rcm += igst;
                taxable += Number(l.taxable_amount);
                if (l.itc_status === "eligible") s.eligible.igst = round2(s.eligible.igst + igst);
                else if (l.itc_status === "blocked") s.blocked.igst = round2(s.blocked.igst + igst);
                else if (l.itc_status === "review") { s.review.igst = round2(s.review.igst + igst); s.review.lines++; }
            }
            s.reverseCharge.taxable = round2(s.reverseCharge.taxable + taxable);
            s.reverseCharge.igst = round2(s.reverseCharge.igst + rcm);
            s.reverseCharge.bills++;
            continue;
        }
        const inTwoB = bill.gstr2b_status === "matched";
        let waiting = false;
        for (const l of lines) {
            if (l.itc_status === "eligible") {
                if (inTwoB) add(s.eligible, l);
                else { add(s.awaiting2b, l); waiting = true; }
            } else if (l.itc_status === "blocked") add(s.blocked, l);
            else if (l.itc_status === "review") { add(s.review, l); s.review.lines++; }
        }
        if (waiting) s.awaiting2b.bills++;
    }
    return s;
}

// ---------------------------------------------------------------------------
// GSTR-2B — the portal's statement of credit available
// ---------------------------------------------------------------------------

interface TwoBDoc { ctin: string; tradeName: string | null; number: string; date: string | null; taxable: number; igst: number; cgst: number; sgst: number; isCredit: boolean }

const normaliseDocNo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** "02-11-2026" / "2026-11-02" → ISO. */
function twoBDate(raw: unknown): string | null {
    const s = String(raw ?? "");
    const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Reads the GSTR-2B JSON downloaded from the GST portal. Tolerant of where
 * the portal nests things (`data.docdata` or `docdata`) and of invoice
 * values given either on the document or in an `items` list. Pure —
 * exported for tests.
 */
export function parseGstr2b(json: unknown): { period: string | null; docs: TwoBDoc[] } {
    const root = json as Record<string, unknown>;
    const data = (root?.data ?? root) as Record<string, unknown>;
    const docdata = (data?.docdata ?? {}) as Record<string, unknown>;
    const period = (data?.rtnprd as string | undefined) ?? null; // MMYYYY
    const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;
    const docs: TwoBDoc[] = [];

    const read = (section: unknown, isCredit: boolean, listKey: "inv" | "nt") => {
        for (const supplier of (section as Record<string, unknown>[] | undefined) ?? []) {
            for (const d of (supplier[listKey] as Record<string, unknown>[] | undefined) ?? []) {
                const items = (d.items as Record<string, unknown>[] | undefined) ?? [];
                const sum = (k: string) => items.length ? items.reduce((t, it) => t + num(it[k]), 0) : num(d[k]);
                docs.push({
                    ctin: String(supplier.ctin ?? "").toUpperCase(),
                    tradeName: (supplier.trdnm as string | undefined) ?? null,
                    number: String(d.inum ?? d.ntnum ?? ""),
                    date: twoBDate(d.dt),
                    taxable: Math.round(sum("txval") * 100) / 100,
                    igst: Math.round(sum("igst") * 100) / 100,
                    cgst: Math.round(sum("cgst") * 100) / 100,
                    sgst: Math.round(sum("sgst") * 100) / 100,
                    isCredit,
                });
            }
        }
    };
    read(docdata.b2b, false, "inv");
    read(docdata.cdnr, true, "nt");
    return { period: period && /^\d{6}$/.test(period) ? `${period.slice(2)}-${period.slice(0, 2)}` : null, docs };
}

export async function importGstr2b(
    file: { buffer: Buffer; originalname: string }, month: string | null, actor: AuthContext,
): Promise<{ month: string; documents: number; matched: number; notInBooks: number; awaiting: number }> {
    let json: unknown;
    try {
        json = JSON.parse(file.buffer.toString("utf8"));
    } catch {
        throw badRequest("Upload the GSTR-2B JSON file downloaded from the GST portal.");
    }
    const parsed = parseGstr2b(json);
    const period = parsed.period ?? month;
    if (!period) throw badRequest("The file does not say which month it is for. Choose the month and upload again.");
    if (parsed.docs.length === 0) throw badRequest("This GSTR-2B has no supplier invoices.");

    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const { data: statement, error } = await db.from("external_statements").upsert({
        source: "gstr2b", external_ref: `${period}:${hash}`, statement_date: `${period}-01`,
        period_from: `${period}-01`, gross_amount: round2(parsed.docs.reduce((t, d) => t + (d.isCredit ? -d.taxable : d.taxable), 0)),
        tax_amount: round2(parsed.docs.reduce((t, d) => t + (d.isCredit ? -1 : 1) * (d.igst + d.cgst + d.sgst), 0)),
        line_count: parsed.docs.length, imported_by_user_id: actor.id, raw: { fileName: file.originalname },
    }, { onConflict: "source,external_ref" }).select("id").single();
    if (error) throw error;
    const statementId = (statement as { id: string }).id;

    // Bills whose ITC is claimed in this month (or earlier, still waiting).
    const { data: bills, error: billsError } = await db.from("purchase_bills")
        .select("id, bill_number, total_amount, taxable_amount, vendors(gstin)")
        .eq("status", "confirmed").eq("is_reverse_charge", false).lte("itc_month", `${period}-01`)
        .in("gstr2b_status", ["not_checked", "not_in_2b", "mismatch"]);
    if (billsError) throw billsError;
    const byKey = new Map<string, { id: string; taxable: number }>();
    for (const b of (bills ?? []) as { id: string; bill_number: string; taxable_amount: number | string; vendors: unknown }[]) {
        const gstin = one(b.vendors as { gstin: string | null } | null)?.gstin;
        if (gstin) byKey.set(`${gstin}|${normaliseDocNo(b.bill_number)}`, { id: b.id, taxable: Number(b.taxable_amount) });
    }

    let matched = 0;
    let notInBooks = 0;
    const rows = parsed.docs.map((d, i) => {
        const bill = byKey.get(`${d.ctin}|${normaliseDocNo(d.number)}`);
        const amountOk = bill && Math.abs(bill.taxable - d.taxable) <= 1;
        if (bill && amountOk) matched++; else if (!bill) notInBooks++;
        return {
            statement_id: statementId, source: "gstr2b", line_no: i + 1,
            external_id: `${d.ctin}|${d.number}`, kind: d.isCredit ? "gstr2b_credit_note" : "gstr2b_invoice",
            value_date: d.date, amount: d.isCredit ? -d.taxable : d.taxable,
            net_amount: d.isCredit ? -d.taxable : d.taxable,
            tax: round2(d.igst + d.cgst + d.sgst),
            description: `${d.tradeName ?? d.ctin} · ${d.number}`,
            counterparty_key: d.ctin,
            fingerprint: createHash("sha256").update(`${period}|${d.ctin}|${normaliseDocNo(d.number)}|${d.isCredit}`).digest("hex"),
            match_status: bill ? (amountOk ? "matched" : "exception") : "unmatched",
            exception_code: bill && !amountOk ? "G4" : null,
            purchase_bill_id: bill?.id ?? null,
            raw: d,
        };
    });
    const { data: existing } = await db.from("external_statement_lines").select("fingerprint").eq("source", "gstr2b")
        .in("fingerprint", rows.map((r) => r.fingerprint));
    const seen = new Set(((existing ?? []) as { fingerprint: string }[]).map((r) => r.fingerprint));
    const fresh = rows.filter((r) => !seen.has(r.fingerprint));
    if (fresh.length) {
        const { error: insError } = await db.from("external_statement_lines").insert(fresh);
        if (insError) throw insError;
    }

    for (const r of rows.filter((x) => x.purchase_bill_id)) {
        await db.from("purchase_bills").update({ gstr2b_status: r.match_status === "matched" ? "matched" : "mismatch" }).eq("id", r.purchase_bill_id);
    }
    // Bills of THIS month the 2B does not show yet: their supplier has not filed.
    const matchedIds = new Set(rows.map((r) => r.purchase_bill_id).filter(Boolean));
    const { data: monthBills } = await db.from("purchase_bills").select("id")
        .eq("status", "confirmed").eq("is_reverse_charge", false).eq("itc_month", `${period}-01`).eq("gstr2b_status", "not_checked");
    let awaiting = 0;
    for (const b of (monthBills ?? []) as { id: string }[]) {
        if (matchedIds.has(b.id)) continue;
        awaiting++;
        await db.from("purchase_bills").update({ gstr2b_status: "not_in_2b" }).eq("id", b.id);
    }

    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.gstr2b_imported", entityType: "external_statement", entityId: statementId, after: { period, documents: parsed.docs.length, matched, notInBooks, awaiting } });
    return { month: period, documents: parsed.docs.length, matched, notInBooks, awaiting };
}

/** 2B entries for a month that no bill in our books matches — a missing expense and unclaimed credit. */
export async function listTwoBNotInBooks(month: string): Promise<{ id: string; supplier: string | null; gstin: string | null; number: string | null; date: string | null; taxable: number; tax: number }[]> {
    const { data, error } = await db.from("external_statement_lines")
        .select("id, description, counterparty_key, external_id, value_date, amount, tax, external_statements!external_statement_lines_statement_id_fkey(statement_date)")
        .eq("source", "gstr2b").is("purchase_bill_id", null).order("value_date");
    if (error) throw error;
    return ((data ?? []) as { id: string; description: string | null; counterparty_key: string | null; external_id: string | null; value_date: string | null; amount: number | string; tax: number | string; external_statements: unknown }[])
        .filter((r) => one(r.external_statements as { statement_date: string } | null)?.statement_date === `${month}-01`)
        .map((r) => ({
            id: r.id, supplier: r.description?.split(" · ")[0] ?? null, gstin: r.counterparty_key,
            number: r.external_id?.split("|")[1] ?? null, date: r.value_date, taxable: Number(r.amount), tax: Number(r.tax),
        }));
}

// ---------------------------------------------------------------------------
// Drafts from the statements Swapngo already holds
// ---------------------------------------------------------------------------

/**
 * Razorpay's fee and HDFC's charges are already known from Stages 2 and 3,
 * so their monthly bills are drafted here. They stay drafts until someone
 * compares them with the real tax invoice — the GST head on Razorpay's
 * invoice depends on the state it bills from, which only its invoice says.
 */
export async function draftBillsFromStatements(month: string, actor: AuthContext): Promise<{ created: string[] }> {
    const start = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const end = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
    const created: string[] = [];

    const { data: settlements, error } = await db.from("external_statements").select("fee_amount, tax_amount")
        .eq("source", "razorpay").gte("statement_date", start).lte("statement_date", end);
    if (error) throw error;
    const fee = round2(((settlements ?? []) as { fee_amount: number | string }[]).reduce((t, s) => t + Number(s.fee_amount), 0));
    const feeGst = round2(((settlements ?? []) as { tax_amount: number | string }[]).reduce((t, s) => t + Number(s.tax_amount), 0));
    if (fee > 0) {
        const vendor = await findOrCreateVendor("Razorpay", { kind: "services", defaultCategory: "razorpay_fees" });
        const interState = !vendor.state_code || vendor.state_code !== "33";
        const { data: exists } = await db.from("purchase_bills").select("id").eq("vendor_id", vendor.id).eq("bill_number", `FEES-${month}`).maybeSingle();
        if (!exists) {
            const bill = await createBill({
                vendorId: vendor.id, billNumber: `FEES-${month}`, billDate: end, itcMonth: start,
                notes: "Drafted from Razorpay settlements. Replace the bill number with the number on Razorpay's tax invoice and check the GST head before confirming.",
                lines: [{
                    description: `Payment gateway fees, ${month}`, category: "razorpay_fees",
                    taxableAmount: round2(fee - feeGst), gstRate: 18,
                    ...(interState ? { igstAmount: feeGst, cgstAmount: 0, sgstAmount: 0 }
                        : { cgstAmount: Math.trunc((feeGst / 2) * 100) / 100, sgstAmount: round2(feeGst - Math.trunc((feeGst / 2) * 100) / 100), igstAmount: 0 }),
                }],
            }, actor, "razorpay_fees");
            created.push(bill.id);
        }
    }

    const { data: charges, error: chargesError } = await db.from("external_statement_lines").select("amount")
        .eq("source", "hdfc").eq("category", "bank_charges").gte("value_date", start).lte("value_date", end);
    if (chargesError) throw chargesError;
    const chargeTotal = round2(((charges ?? []) as { amount: number | string }[]).reduce((t, c) => t + Math.abs(Number(c.amount)), 0));
    if (chargeTotal > 0) {
        // HDFC's Tamil Nadu GSTIN, printed on its own account statement.
        const vendor = await findOrCreateVendor("HDFC Bank Ltd", { kind: "bank", gstin: "33AAACH2702H1Z7", defaultCategory: "bank_charges" });
        const { data: exists } = await db.from("purchase_bills").select("id").eq("vendor_id", vendor.id).eq("bill_number", `CHG-${month}`).maybeSingle();
        if (!exists) {
            const taxable = round2(chargeTotal / 1.18);
            const tax = round2(chargeTotal - taxable);
            const cgst = Math.trunc((tax / 2) * 100) / 100;
            const bill = await createBill({
                vendorId: vendor.id, billNumber: `CHG-${month}`, billDate: end, itcMonth: start,
                notes: "Drafted from HDFC statement lines categorised as bank charges (assumed to include 18% GST). Check against HDFC's GST invoice before confirming.",
                lines: [{ description: `Bank charges, ${month}`, category: "bank_charges", taxableAmount: taxable, gstRate: 18, cgstAmount: cgst, sgstAmount: round2(tax - cgst), igstAmount: 0 }],
            }, actor, "bank_charges");
            created.push(bill.id);
        }
    }
    return { created };
}

// ---------------------------------------------------------------------------
// Fixed assets — the fleet
// ---------------------------------------------------------------------------

export interface AssetRow {
    vehicleId: string; registrationNumber: string; model: string | null; purchasedOn: string | null;
    cost: number | null; billNumber: string | null; status: string;
    /** Written-down value at the end of the current financial year, at the given rate. */
    writtenDownValue: number | null;
}

/**
 * Written-down-value depreciation: a full year's rate in a year the asset is
 * used 180 days or more, half the rate otherwise (the Income-tax Act's rule
 * for the year of purchase). The rate is the CA's decision, so it is a
 * parameter, never stored. Pure — exported for tests.
 */
export function writtenDownValue(cost: number, purchasedOn: string, ratePercent: number, asOf: string): number {
    let value = cost;
    const fyEnd = (d: string) => {
        const y = Number(d.slice(0, 4));
        return Number(d.slice(5, 7)) >= 4 ? `${y + 1}-03-31` : `${y}-03-31`;
    };
    let yearEnd = fyEnd(purchasedOn);
    const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000) + 1;
    let first = true;
    while (yearEnd <= fyEnd(asOf)) {
        const rate = first && days(purchasedOn, yearEnd) < 180 ? ratePercent / 2 : ratePercent;
        value = round2(value * (1 - rate / 100));
        first = false;
        yearEnd = `${Number(yearEnd.slice(0, 4)) + 1}-03-31`;
    }
    return value;
}

export async function assetRegister(ratePercent: number): Promise<AssetRow[]> {
    const { data, error } = await db.from("vehicles")
        .select("id, registration_number, purchased_on, cost_amount, status, vehicle_models(name), purchase_bill_lines(purchase_bills(bill_number))")
        .order("purchased_on", { ascending: true, nullsFirst: false });
    if (error) throw error;
    const today = businessToday();
    return ((data ?? []) as { id: string; registration_number: string; purchased_on: string | null; cost_amount: number | string | null; status: string; vehicle_models: unknown; purchase_bill_lines: unknown }[])
        .map((v) => {
            const line = one(v.purchase_bill_lines as { purchase_bills: unknown } | null);
            const cost = v.cost_amount == null ? null : Number(v.cost_amount);
            return {
                vehicleId: v.id, registrationNumber: v.registration_number,
                model: one(v.vehicle_models as { name: string } | null)?.name ?? null,
                purchasedOn: v.purchased_on, cost, status: v.status,
                billNumber: one(line?.purchase_bills as { bill_number: string } | null)?.bill_number ?? null,
                writtenDownValue: cost != null && v.purchased_on ? writtenDownValue(cost, v.purchased_on, ratePercent, today) : null,
            };
        });
}

/** Links a scooter to the bill line that bought it, and records its cost (incl. blocked GST). */
export async function setVehicleCost(vehicleId: string, input: { billLineId: string | null; cost: number; purchasedOn?: string | null }, actor: AuthContext): Promise<void> {
    if (input.billLineId) {
        const { data, error } = await db.from("purchase_bill_lines").select("id, category").eq("id", input.billLineId).maybeSingle();
        if (error) throw error;
        if (!data) throw badRequest("That bill line does not exist.");
    }
    const update: Record<string, unknown> = { purchase_bill_line_id: input.billLineId, cost_amount: round2(input.cost) };
    if (input.purchasedOn) update.purchased_on = input.purchasedOn;
    const { data, error } = await db.from("vehicles").update(update).eq("id", vehicleId).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Vehicle not found.");
    await writeAudit({ actorId: actor.id, targetUserId: null, action: "purchase.asset_cost_set", entityType: "vehicle", entityId: vehicleId, after: { ...input } });
}
