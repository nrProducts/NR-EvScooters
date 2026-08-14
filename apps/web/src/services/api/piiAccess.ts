import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, PiiAccessEntry, PiiAccessReason } from "@/types";

export interface PiiAccessFilters {
  actorId?: string;
  targetUserId?: string;
  resource?: string;
  reason?: PiiAccessReason | "all";
  /** ISO datetime; entries strictly before this are excluded. */
  since?: string;
  page?: number;
  pageSize?: number;
}

/**
 * GET /pii-access — requireAdmin.
 *
 * The read-side counterpart of the audit log: audit_logs answers "who changed
 * this", this answers "who looked at this".
 */
export async function fetchPiiAccess(
  filters: PiiAccessFilters = {},
): Promise<PaginatedResult<PiiAccessEntry>> {
  const { reason, page = 1, pageSize = 20, ...rest } = filters;
  const res = await apiClient.get<BackendPaginated<PiiAccessEntry>>("/pii-access", {
    ...rest,
    reason: reason && reason !== "all" ? reason : undefined,
    page,
    pageSize,
  });
  return toPaginatedResult(res);
}
