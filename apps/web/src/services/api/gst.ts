import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";
import type { ItcSummary } from "./purchases";

/** Mirrors apps/backend/src/modules/gst/gst.types.ts. */
export type TaxDocumentType = "tax_invoice" | "credit_note";
export type TaxDocumentSource = "invoice_paid" | "invoice_unpaid_30d" | "deposit_retained" | "refund";

export interface TaxDocumentLine {
  description: string;
  sac: string;
  gross: number;
  taxable: number;
  cgst: number;
  sgst: number;
}

export interface TaxDocument {
  id: string;
  docType: TaxDocumentType;
  source: TaxDocumentSource;
  docNumber: string;
  supplyDate: string;
  issuedOn: string;
  userId: string;
  recipientName: string;
  invoiceId: string | null;
  billNumber: string | null;
  rentalId: string | null;
  refundId: string | null;
  originalDocumentId: string | null;
  originalDocNumber: string | null;
  placeOfSupply: string;
  sacCode: string;
  gstRate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  status: "issued" | "cancelled";
  /** The GSTR-1 month this document is reported in (YYYY-MM-01). */
  returnPeriod?: string | null;
  lines: TaxDocumentLine[];
  createdAt: string;
}

export interface TaxDocumentTotals {
  count: number;
  taxable: number;
  cgst: number;
  sgst: number;
  total: number;
  firstNumber: string | null;
  lastNumber: string | null;
}

export interface TaxDocumentSummary {
  from: string;
  to: string;
  taxInvoices: TaxDocumentTotals;
  creditNotes: TaxDocumentTotals;
  net: { taxable: number; cgst: number; sgst: number; total: number };
  cancelledCount: number;
}

export interface PendingTaxDocuments {
  total: number;
  byKind: { paid: number; unpaid: number; kept: number; refund: number };
  recentFailures: { at: string; entityType: string; entityId: string; error: string }[];
}

export interface GstProfile {
  id: string;
  effectiveFrom: string;
  legalName: string;
  tradeName: string | null;
  gstin: string;
  stateCode: string;
  stateName: string;
  address: string;
  sacCode: string;
  gstRate: number;
  createdAt: string;
  inUse: boolean;
  isCurrent: boolean;
}

export interface CreateGstProfileInput {
  effectiveFrom: string;
  legalName: string;
  tradeName?: string | null;
  gstin: string;
  stateName: string;
  address: string;
  sacCode: string;
  gstRate: number;
}

export interface TaxDocumentFilters {
  from: string;
  to: string;
  docType?: TaxDocumentType;
  source?: TaxDocumentSource;
  search?: string;
  page?: number;
  pageSize?: number;
}

/** GET /gst/documents — gst.view. See apps/backend/src/modules/gst/gst.routes.ts */
export async function fetchTaxDocuments(f: TaxDocumentFilters): Promise<PaginatedResult<TaxDocument>> {
  const res = await apiClient.get<BackendPaginated<TaxDocument>>("/gst/documents", {
    from: f.from,
    to: f.to,
    docType: f.docType,
    source: f.source,
    search: f.search || undefined,
    page: f.page ?? 1,
    pageSize: f.pageSize ?? 15,
  });
  return toPaginatedResult(res);
}

export async function fetchTaxDocumentSummary(from: string, to: string): Promise<TaxDocumentSummary> {
  return apiClient.get<TaxDocumentSummary>("/gst/documents/summary", { from, to });
}

export async function fetchPendingTaxDocuments(): Promise<PendingTaxDocuments> {
  return apiClient.get<PendingTaxDocuments>("/gst/documents/pending");
}

export async function issuePendingTaxDocuments(): Promise<{ issued: number }> {
  return apiClient.post<{ issued: number }>("/gst/documents/issue-pending");
}

export async function fetchGstProfiles(): Promise<GstProfile[]> {
  return apiClient.get<GstProfile[]>("/gst/profiles");
}

export async function createGstProfile(input: CreateGstProfileInput): Promise<GstProfile> {
  return apiClient.post<GstProfile>("/gst/profiles", input);
}

/** Same blob-to-file pattern as downloadRevenueExport — a plain <a href> could not carry the bearer token. */
export async function saveBlob(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<void> {
  const { blob, filename } = await apiClient.getBlob(path, query);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const downloadTaxDocumentPdf = (id: string) => saveBlob(`/gst/documents/${id}/pdf`);
export const downloadTaxRegister = (from: string, to: string, format: "xlsx" | "csv") =>
  saveBlob("/gst/documents/export", { from, to, format });
export const downloadTaxDocumentZip = (from: string, to: string) =>
  saveBlob("/gst/documents/export-pdfs", { from, to });

// --- Stage 5: monthly returns. Mirrors apps/backend/src/modules/gst/gst.returns.ts ---

export type ReturnStatus = "not_started" | "ready" | "sent" | "filed";

export interface ReturnState { status: ReturnStatus; arn: string | null; filedOn: string | null; dueOn: string; overdueDays: number }

export interface ReturnPeriod {
  month: string;
  gstr1: ReturnState;
  gstr3b: ReturnState;
  taxPaidCash: number | null;
  challanCpin: string | null;
  locked: boolean;
}

export interface ReturnCheck { key: string; label: string; ok: boolean; detail: string }

type Heads = { igst: number; cgst: number; sgst: number };

export interface ReturnWorksheet {
  month: string;
  gstin: string;
  legalName: string;
  status: ReturnPeriod;
  gstr1: {
    table7: { rate: number; placeOfSupply: string; taxable: number; cgst: number; sgst: number }[];
    table12: { sac: string; rate: number; taxable: number; cgst: number; sgst: number; total: number }[];
    table13: { nature: string; from: string | null; to: string | null; total: number; cancelled: number; net: number }[];
  };
  gstr3b: {
    outward: { taxable: number } & Heads;
    reverseCharge: { taxable: number; igst: number };
    itc: ItcSummary;
    setOff: {
      liability: Heads;
      creditUsed: { igstAgainstCgst: number; igstAgainstSgst: number; cgstAgainstCgst: number; sgstAgainstSgst: number };
      cash: Heads & { total: number };
      creditCarriedForward: Heads;
    };
    lateEstimate: { daysLate: number; interest: number; lateFee: number };
  };
  checks: ReturnCheck[];
  ready: boolean;
}

export interface ReturnStatusInput {
  return: "gstr1" | "gstr3b";
  status: ReturnStatus;
  arn?: string | null;
  filedOn?: string | null;
  taxPaidCash?: number | null;
  challanCpin?: string | null;
  interestPaid?: number | null;
  lateFeePaid?: number | null;
}

export const fetchReturnPeriods = () => apiClient.get<ReturnPeriod[]>("/gst/returns");
export const fetchReturnWorksheet = (month: string) => apiClient.get<ReturnWorksheet>(`/gst/returns/${month}`);
export const updateReturnStatus = (month: string, input: ReturnStatusInput) =>
  apiClient.post<ReturnPeriod>(`/gst/returns/${month}/status`, input);
export const downloadReturnWorksheet = (month: string) => saveBlob(`/gst/returns/${month}/worksheet.xlsx`);
export const downloadGstr1Json = (month: string) => saveBlob(`/gst/returns/${month}/gstr1.json`);
export const downloadAuditorPack = (month: string) => saveBlob(`/gst/returns/${month}/pack`);
