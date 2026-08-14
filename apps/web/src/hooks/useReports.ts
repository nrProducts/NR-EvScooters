import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/reports";

export function useReportsSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["reports", "summary"],
    queryFn: api.fetchReportsSummary,
    enabled: options?.enabled ?? true,
  });
}
