import { apiClient } from "./httpClient";
import type { ReportsSummary } from "@/types";

/** GET /reports/summary — requireStaff. See apps/backend/src/modules/reports/reports.routes.ts */
export async function fetchReportsSummary(): Promise<ReportsSummary> {
  return apiClient.get<ReportsSummary>("/reports/summary");
}
