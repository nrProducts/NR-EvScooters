import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/reports";

export function useReportsSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["reports", "summary"],
    queryFn: api.fetchReportsSummary,
    enabled: options?.enabled ?? true,
  });
}

/** Polled — the header bell doesn't sit behind a realtime channel like the notification bell does. */
export function usePendingApprovals() {
  return useQuery({
    queryKey: ["reports", "pending-approvals"],
    queryFn: api.fetchPendingApprovals,
    refetchInterval: 60_000,
  });
}
