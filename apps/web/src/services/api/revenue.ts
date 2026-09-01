import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

// Mirrors apps/backend/src/modules/revenue/revenue.types.ts

export type RevenueGranularity = "daily" | "weekly" | "monthly" | "yearly";

export interface RevenueMoneyFigures {
  gross: number;
  refunds: number;
  net: number;
  lateFees: number;
  additionalCharges: number;
  damageCharges: number;
}

export interface DepositFigures {
  collected: number;
  refunded: number;
  adjusted: number;
  held: number;
}

export interface RevenueSummary extends RevenueMoneyFigures {
  range: { from: string; to: string };
  deposits: DepositFigures;
  pendingRefunds: number;
  previous?: RevenueMoneyFigures & { deposits: DepositFigures };
  deltaPct?: Partial<Record<keyof RevenueMoneyFigures | "depositsCollected", number | null>>;
}

export interface RevenueTrendPoint {
  bucket: string;
  gross: number;
  refunds: number;
  net: number;
  lateFees: number;
  additionalCharges: number;
}

export type RevenueType =
  | "rental" | "renewal" | "late_fee" | "damage" | "additional_charge" | "discount";

export interface RevenueByTypeRow {
  type: RevenueType | "gross";
  label: string;
  amount: number;
  count: number;
  pct: number;
}

export interface RefundBreakdown {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  rejected: number;
  count: number;
  avg: number;
  byReason: { reason: string; label: string; amount: number; count: number }[];
}

export interface RevenueByMethodRow {
  method: string;
  amount: number;
  count: number;
}

export type RevenueTxnType =
  | "rental_payment" | "renewal_payment" | "late_fee" | "additional_charge"
  | "damage_charge" | "security_deposit" | "security_deposit_refund" | "refund";

export interface RevenueTransactionRow {
  id: string;
  kind: "payment" | "refund";
  bookingId: string | null;
  riderName: string;
  riderId: string;
  vehicleNumber: string | null;
  date: string;
  type: RevenueTxnType;
  method: string | null;
  gross: number;
  refund: number;
  deposit: number;
  lateFee: number;
  additionalCharge: number;
  net: number;
  paymentStatus: string | null;
  refundStatus: string | null;
}

export interface RevenueTransactionFilters {
  from: string;
  to: string;
  search?: string;
  riderId?: string;
  vehicleId?: string;
  type?: RevenueTxnType | "all";
  method?: string | "all";
  paymentStatus?: string | "all";
  refundStatus?: string | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "date" | "gross" | "net";
  sortDir?: "asc" | "desc";
}

type Range = { from: string; to: string };

export function fetchRevenueSummary(r: Range, compare?: Range): Promise<RevenueSummary> {
  return apiClient.get<RevenueSummary>("/revenue/summary", {
    from: r.from, to: r.to, compareFrom: compare?.from, compareTo: compare?.to,
  });
}

export function fetchRevenueTrend(r: Range, granularity: RevenueGranularity): Promise<RevenueTrendPoint[]> {
  return apiClient.get<RevenueTrendPoint[]>("/revenue/trend", { ...r, granularity });
}

export function fetchRevenueByType(r: Range): Promise<RevenueByTypeRow[]> {
  return apiClient.get<RevenueByTypeRow[]>("/revenue/by-type", r);
}

export function fetchRevenueByMethod(r: Range): Promise<RevenueByMethodRow[]> {
  return apiClient.get<RevenueByMethodRow[]>("/revenue/by-method", r);
}

export function fetchRevenueRefunds(r: Range): Promise<RefundBreakdown> {
  return apiClient.get<RefundBreakdown>("/revenue/refunds", r);
}

export function fetchRevenueDeposits(r: Range): Promise<DepositFigures & { formula: string }> {
  return apiClient.get<DepositFigures & { formula: string }>("/revenue/deposits", r);
}

export async function fetchRevenueTransactions(
  f: RevenueTransactionFilters,
): Promise<PaginatedResult<RevenueTransactionRow>> {
  const res = await apiClient.get<BackendPaginated<RevenueTransactionRow>>("/revenue/transactions", {
    from: f.from, to: f.to, search: f.search, riderId: f.riderId, vehicleId: f.vehicleId,
    type: f.type, method: f.method, paymentStatus: f.paymentStatus, refundStatus: f.refundStatus,
    page: f.page ?? 1, pageSize: f.pageSize ?? 20, sortBy: f.sortBy ?? "date", sortDir: f.sortDir ?? "desc",
  });
  return toPaginatedResult(res);
}

export async function downloadRevenueExport(
  f: RevenueTransactionFilters, format: "csv" | "xlsx",
): Promise<void> {
  const { blob, filename } = await apiClient.getBlob("/revenue/export", {
    from: f.from, to: f.to, search: f.search, riderId: f.riderId, vehicleId: f.vehicleId,
    type: f.type, method: f.method, paymentStatus: f.paymentStatus, refundStatus: f.refundStatus,
    sortBy: f.sortBy ?? "date", sortDir: f.sortDir ?? "desc", format,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
