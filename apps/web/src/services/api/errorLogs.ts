import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { ErrorLogClient, ErrorLogEntry, PaginatedResult } from "@/types";

export interface ErrorLogFilters {
  client?: ErrorLogClient;
  search?: string;
  minStatus?: number;
  page?: number;
  pageSize?: number;
}

/** GET /error-logs — requireAction("error_logs","view"). See apps/backend/src/modules/errorLogs/errorLogs.routes.ts */
export async function fetchErrorLogs(filters: ErrorLogFilters = {}): Promise<PaginatedResult<ErrorLogEntry>> {
  const { client, search, minStatus, page = 1, pageSize = 20 } = filters;
  const res = await apiClient.get<BackendPaginated<ErrorLogEntry>>("/error-logs", {
    page,
    pageSize,
    client,
    search,
    minStatus,
  });
  return toPaginatedResult(res);
}
