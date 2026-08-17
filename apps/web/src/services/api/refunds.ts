import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Refund, RefundStatus, RefundType } from "@/types";

export interface RefundFilters {
  status?: RefundStatus | "all";
  refundType?: RefundType | "all";
  bookingId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "amount";
  sortDir?: "asc" | "desc";
}

/** GET /refunds — requireStaff. See apps/backend/src/modules/refunds/refunds.routes.ts */
export async function fetchRefunds(filters: RefundFilters = {}): Promise<PaginatedResult<Refund>> {
  const { status, refundType, bookingId, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<Refund>>("/refunds", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    refundType: refundType && refundType !== "all" ? refundType : undefined,
    bookingId,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** POST /refunds — creates (or reuses) the pending refund. Never auto-processes it — see retryRefund. */
export async function createRefund(depositId: string): Promise<Refund> {
  return apiClient.post<Refund>("/refunds", { deposit_id: depositId });
}

export interface RefundSettlementLine {
  id: string;
  description: string;
  amount: number;
  deposit_deduction: number;
  outstanding_amount: number;
  created_at: string;
}

export interface RefundSettlement {
  refund: Refund;
  depositAmount: number;
  lines: RefundSettlementLine[];
  totalDeduction: number;
  netRefund: number;
  /** Sum of every line's outstanding_amount — billed separately because deductions exceeded the deposit. */
  additionalAmountDue: number;
}

/** GET /refunds/:id/settlement — full breakdown for the approval screen (deposit refunds only; not meaningful for a booking_cancellation refund). */
export async function fetchRefundSettlement(id: string): Promise<RefundSettlement> {
  return apiClient.get<RefundSettlement>(`/refunds/${id}/settlement`);
}

/** POST /refunds/:id/retry — approves a pending refund (either refund_type) or re-attempts a failed one. */
export async function retryRefund(id: string): Promise<Refund> {
  return apiClient.post<Refund>(`/refunds/${id}/retry`);
}
