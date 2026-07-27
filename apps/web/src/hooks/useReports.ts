import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/reports";

export function useReportsSummary() {
  return useQuery({ queryKey: ["reports", "summary"], queryFn: api.fetchReportsSummary });
}
