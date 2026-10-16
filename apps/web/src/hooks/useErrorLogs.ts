import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/errorLogs";

export function useErrorLogs(filters: api.ErrorLogFilters) {
  return useQuery({
    queryKey: ["error-logs", filters],
    queryFn: () => api.fetchErrorLogs(filters),
    // Admins open this screen specifically to see what's going wrong RIGHT
    // NOW — a stale list is actively unhelpful here, unlike most admin
    // screens where react-query's default "don't refetch on focus" is fine.
    refetchInterval: 30_000,
  });
}
