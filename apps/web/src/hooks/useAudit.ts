import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/audit";

export function useAuditLogs(filters: api.AuditLogFilters) {
  return useQuery({ queryKey: ["audit-logs", filters], queryFn: () => api.fetchAuditLogs(filters) });
}
