import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, SupportPriority, SupportStatus, SupportTicket } from "@/types";

export interface SupportFilters {
  status?: SupportStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /support — requireStaff. See apps/backend/src/modules/support/support.routes.ts */
export async function fetchSupportQueue(filters: SupportFilters = {}): Promise<PaginatedResult<SupportTicket>> {
  const { status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<SupportTicket>>("/support", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /support/:id */
export async function fetchSupportTicket(id: string): Promise<SupportTicket> {
  return apiClient.get<SupportTicket>(`/support/${id}`);
}

/** PATCH /support/:id — status, priority and/or assignee. */
export async function updateSupportTicket(
  id: string,
  input: { status?: SupportStatus; priority?: SupportPriority; assigned_to?: string },
) {
  return apiClient.patch<SupportTicket>(`/support/${id}`, input);
}
