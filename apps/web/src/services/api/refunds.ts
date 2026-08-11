import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Refund, RefundStatus } from "@/types";

export interface RefundFilters {
  status?: RefundStatus | "all";
  bookingId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "amount";
  sortDir?: "asc" | "desc";
}

/** GET /refunds — requireStaff. See apps/backend/src/modules/refunds/refunds.routes.ts */
export async function fetchRefunds(filters: RefundFilters = {}): Promise<PaginatedResult<Refund>> {
  const { status, bookingId, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<Refund>>("/refunds", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    bookingId,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** POST /refunds — creates (or reuses) the pending refund and drives it through the gateway synchronously. */
export async function createRefund(depositId: string): Promise<Refund> {
  return apiClient.post<Refund>("/refunds", { deposit_id: depositId });
}

/** POST /refunds/:id/retry — re-attempts a failed refund. */
export async function retryRefund(id: string): Promise<Refund> {
  return apiClient.post<Refund>(`/refunds/${id}/retry`);
}
