import { apiClient } from "./httpClient";
import type { PendingApprovalsSummary, ReportsSummary } from "@/types";

/** GET /reports/summary — requireStaff. See apps/backend/src/modules/reports/reports.routes.ts */
export async function fetchReportsSummary(): Promise<ReportsSummary> {
  return apiClient.get<ReportsSummary>("/reports/summary");
}

/** GET /reports/pending-approvals — cheap, no per-module permission gate. */
export async function fetchPendingApprovals(): Promise<PendingApprovalsSummary> {
  return apiClient.get<PendingApprovalsSummary>("/reports/pending-approvals");
}
