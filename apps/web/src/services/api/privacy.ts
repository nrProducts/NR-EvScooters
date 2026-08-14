import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { DpRequestStatus, DpRequestType, PaginatedResult, PrivacyRequest } from "@/types";

export interface PrivacyRequestFilters {
  type?: DpRequestType | "all";
  status?: DpRequestStatus | "all";
  overdueOnly?: boolean;
  assignedTo?: string;
  page?: number;
  pageSize?: number;
}

/** GET /privacy/requests — requireStaff + rights_officer capability. */
export async function fetchRequests(
  filters: PrivacyRequestFilters = {},
): Promise<PaginatedResult<PrivacyRequest>> {
  const { type, status, overdueOnly, assignedTo, page = 1, pageSize = 20 } = filters;
  const res = await apiClient.get<BackendPaginated<PrivacyRequest>>("/privacy/requests", {
    type: type && type !== "all" ? type : undefined,
    status: status && status !== "all" ? status : undefined,
    overdueOnly: overdueOnly ? "true" : undefined,
    assignedTo,
    page,
    pageSize,
  });
  return toPaginatedResult(res);
}

export async function fetchRequest(id: string): Promise<PrivacyRequest> {
  return apiClient.get<PrivacyRequest>(`/privacy/requests/${id}`);
}

export async function updateRequest(
  id: string,
  patch: {
    status?: "in_progress" | "awaiting_principal" | "completed";
    assigned_to?: string | null;
    resolution_notes?: string;
    ticket_ref?: string;
  },
): Promise<PrivacyRequest> {
  return apiClient.patch<PrivacyRequest>(`/privacy/requests/${id}`, patch);
}

/** The reason is sent to the rider verbatim, so the backend requires ≥10 chars. */
export async function rejectRequest(id: string, reason: string): Promise<PrivacyRequest> {
  return apiClient.post<PrivacyRequest>(`/privacy/requests/${id}/reject`, { reason });
}

/**
 * Starts the cooling-off clock. Reversible — the rider can still cancel, and
 * so can we. Deliberately separate from execution.
 */
export async function approveErasure(id: string): Promise<PrivacyRequest> {
  return apiClient.post<PrivacyRequest>(`/privacy/requests/${id}/approve-erasure`);
}

/**
 * Destroys the rider's identity. IRREVERSIBLE.
 *
 * `force` skips the remaining cooling-off window and requires a reason; the
 * backend also refuses to let the approver be the one who forces it.
 */
export async function executeErasure(
  id: string,
  input: { force?: boolean; reason?: string } = {},
): Promise<PrivacyRequest> {
  return apiClient.post<PrivacyRequest>(`/privacy/requests/${id}/execute-erasure`, {
    force: input.force ?? false,
    reason: input.reason,
  });
}
