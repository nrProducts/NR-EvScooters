import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AuditLogEntry, PaginatedResult } from "@/types";

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  page?: number;
  pageSize?: number;
}

/** GET /audit-logs — requireAdmin. See apps/backend/src/modules/audit/audit.routes.ts */
export async function fetchAuditLogs(filters: AuditLogFilters = {}): Promise<PaginatedResult<AuditLogEntry>> {
  const { action, entityType, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<AuditLogEntry>>("/audit-logs", {
    page,
    pageSize,
    action,
    entityType,
  });
  return toPaginatedResult(res);
}
