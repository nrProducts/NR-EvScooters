import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

export interface UnmatchedInternalPayment {
  gatewayPaymentId: string;
  amount: number;
  appliedAt: string;
}

export interface MissingGatewayPayment {
  gatewayPaymentId: string;
  amount: number;
  status: string;
  createdAt: string;
}

export interface FailedWebhookEvent {
  id: string;
  eventType: string;
  signatureValid: boolean;
  processed: boolean;
  error: string | null;
  receivedAt: string;
}

export interface ReconciliationReport {
  range: { from: string; to: string };
  internalPaymentCount: number;
  gatewayPaymentCount: number;
  unmatchedInternal: UnmatchedInternalPayment[];
  missingInternal: MissingGatewayPayment[];
  failedWebhooks: FailedWebhookEvent[];
  gatewayUnavailable: boolean;
}

/** GET /reconciliation — requireAdmin. See apps/backend/src/modules/reconciliation/reconciliation.routes.ts */
export async function fetchReconciliation(from: string, to: string): Promise<ReconciliationReport> {
  return apiClient.get<ReconciliationReport>("/reconciliation", { from, to });
}

// ---------------------------------------------------------------------------
// Stages 2–3 — Razorpay settlements, HDFC statements, exceptions.
// Mirrors apps/backend/src/modules/reconciliation/statements.types.ts.
// ---------------------------------------------------------------------------


export type StatementSource = "razorpay" | "hdfc";
export type LineMatchStatus = "unmatched" | "matched" | "exception" | "resolved" | "ignored";

export interface StatementRow {
  id: string;
  source: StatementSource;
  externalRef: string;
  accountRef: string | null;
  utr: string | null;
  statementDate: string;
  periodFrom: string | null;
  periodTo: string | null;
  grossAmount: number;
  refundAmount: number;
  feeAmount: number;
  taxAmount: number;
  netAmount: number;
  openingBalance: number | null;
  closingBalance: number | null;
  lineCount: number;
  openExceptions: number;
  status: "balanced" | "exceptions";
  statusNote: string | null;
  bankMatched: boolean;
  syncedAt: string;
}

export interface StatementLineRow {
  id: string;
  statementId: string;
  source: StatementSource;
  lineNo: number;
  externalId: string | null;
  kind: "payment" | "refund" | "adjustment" | "transfer" | "bank_credit" | "bank_debit";
  occurredAt: string | null;
  valueDate: string | null;
  amount: number;
  netAmount: number;
  fee: number;
  tax: number;
  method: string | null;
  gatewayOrderId: string | null;
  description: string | null;
  runningBalance: number | null;
  counterpartyKey: string | null;
  category: string | null;
  categorySource: "auto" | "learned" | "manual" | null;
  matchStatus: LineMatchStatus;
  exceptionCode: string | null;
  paymentTransactionId: string | null;
  refundId: string | null;
  matchedStatementId: string | null;
  riderId: string | null;
  riderName: string | null;
  billNumber: string | null;
  resolvedAt: string | null;
  resolvedNote: string | null;
}

export interface StatementDetail extends StatementRow {
  lines: StatementLineRow[];
}

export interface SettlementMonthSummary {
  month: string;
  from: string;
  to: string;
  captured: number;
  capturedCount: number;
  refunded: number;
  fees: number;
  feeGst: number;
  settled: number;
  settlementCount: number;
  inTransitAtEnd: number;
  inTransitCount: number;
  openExceptions: number;
  syncedSince: string | null;
}

export interface ExceptionRow {
  id: string;
  code: string;
  kind: "line" | "unsettled";
  lineId: string | null;
  statementId: string | null;
  externalId: string | null;
  amount: number;
  occurredAt: string | null;
  riderId: string | null;
  riderName: string | null;
  gatewayOrderId: string | null;
  description: string | null;
  status: LineMatchStatus | "open";
  resolvedAt: string | null;
  resolvedNote: string | null;
}

export interface BankImportPreview {
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
  blocked: boolean;
  newAccount: boolean;
}

export interface CashBook {
  month: string;
  openingInHand: number;
  days: { date: string; collected: number; deposited: number; inHand: number }[];
  inHand: number;
  oldestUndepositedDays: number;
}

export interface TieOut {
  month: string;
  settledByRazorpay: number;
  settlementCount: number;
  receivedInBank: number;
  receivedCount: number;
  difference: number;
  notReceived: { statementId: string; settlementId: string; utr: string | null; date: string; amount: number }[];
  bankCoveredUntil: string | null;
  uncategorisedLines: number;
  openBankExceptions: number;
}

export async function fetchStatements(f: {
  source: StatementSource; from: string; to: string; page?: number; pageSize?: number;
}): Promise<PaginatedResult<StatementRow>> {
  const res = await apiClient.get<BackendPaginated<StatementRow>>("/reconciliation/statements", {
    source: f.source, from: f.from, to: f.to, page: f.page ?? 1, pageSize: f.pageSize ?? 15,
  });
  return toPaginatedResult(res);
}

export const fetchStatement = (id: string) => apiClient.get<StatementDetail>(`/reconciliation/statements/${id}`);
export const fetchSettlementSummary = (month: string) =>
  apiClient.get<SettlementMonthSummary>("/reconciliation/settlements/summary", { month });
export const syncSettlements = (from: string, to: string) =>
  apiClient.post<{ settlements: number; linesAdded: number; linesMatched: number }>("/reconciliation/settlements/sync", { from, to });

export const fetchExceptions = (status: "open" | "resolved", code?: string) =>
  apiClient.get<ExceptionRow[]>("/reconciliation/exceptions", { status, code });
export const resolveException = (id: string, action: "resolve" | "ignore", note: string) =>
  apiClient.post<StatementLineRow>(`/reconciliation/exceptions/${id}/resolve`, { action, note });
export const recoverExceptionPayment = (id: string) =>
  apiClient.post<{ status: string }>(`/reconciliation/exceptions/${id}/recover-payment`);

export async function fetchBankLines(f: {
  from: string; to: string; filter: "all" | "uncategorised" | "exceptions"; category?: string;
  search?: string; page?: number; pageSize?: number;
}): Promise<PaginatedResult<StatementLineRow>> {
  const res = await apiClient.get<BackendPaginated<StatementLineRow>>("/reconciliation/bank/lines", {
    from: f.from, to: f.to, filter: f.filter, category: f.category, search: f.search || undefined,
    page: f.page ?? 1, pageSize: f.pageSize ?? 15,
  });
  return toPaginatedResult(res);
}

export const categoriseBankLine = (id: string, category: string, applyToCounterparty: boolean) =>
  apiClient.post<{ updated: number }>(`/reconciliation/bank/lines/${id}/category`, { category, applyToCounterparty });

export function previewBankStatement(file: File): Promise<BankImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiClient.postForm<BankImportPreview>("/reconciliation/bank/preview", form);
}

export function importBankStatement(file: File, confirmNewAccount: boolean) {
  const form = new FormData();
  form.append("file", file);
  form.append("confirmNewAccount", String(confirmNewAccount));
  return apiClient.postForm<{ statementId: string; matched: number; exceptions: number }>("/reconciliation/bank/import", form);
}

export const fetchCashBook = (month: string) => apiClient.get<CashBook>("/reconciliation/cash-book", { month });
export const fetchTieOut = (month: string) => apiClient.get<TieOut>("/reconciliation/tie-out", { month });

export async function downloadSettlementExport(month: string): Promise<void> {
  const { blob, filename } = await apiClient.getBlob("/reconciliation/settlements/export", { month });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
