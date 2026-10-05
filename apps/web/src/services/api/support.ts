import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  PaginatedResult, RiderImpactDecision, RiderImpactPreview, SupportPriority, SupportStatus, SupportTicket,
} from "@/types";

export interface SupportFilters {
  status?: SupportStatus | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "created_at";
  sortDir?: "asc" | "desc";
}

/** GET /support — requireStaff. See apps/backend/src/modules/support/support.routes.ts */
export async function fetchSupportQueue(filters: SupportFilters = {}): Promise<PaginatedResult<SupportTicket>> {
  const { status, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<SupportTicket>>("/support", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** GET /support/:id */
export async function fetchSupportTicket(id: string): Promise<SupportTicket> {
  return apiClient.get<SupportTicket>(`/support/${id}`);
}

/**
 * GET /support/:id/rider-impact-preview — checks whether starting progress
 * on this ticket would flag a vehicle currently held by an active rider.
 * Call before a plain status update to "in_progress"; if `required` is true,
 * collect a decision and resend with `rider_impact` set instead.
 */
export async function fetchRiderImpactPreview(id: string): Promise<RiderImpactPreview> {
  return apiClient.get<RiderImpactPreview>(`/support/${id}/rider-impact-preview`);
}

export interface UpdateSupportTicketInput {
  status?: SupportStatus;
  priority?: SupportPriority;
  assigned_to?: string;
  rider_impact?: RiderImpactDecision;
}

/** PATCH /support/:id — status, priority and/or assignee. */
export async function updateSupportTicket(id: string, input: UpdateSupportTicketInput) {
  return apiClient.patch<SupportTicket>(`/support/${id}`, input);
}
