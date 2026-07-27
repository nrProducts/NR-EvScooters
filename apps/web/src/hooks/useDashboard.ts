import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/dashboard";

export function useDashboardSummary() {
  return useQuery({ queryKey: ["dashboard-summary"], queryFn: api.fetchDashboardSummary });
}

export function useActivityFeed() {
  return useQuery({ queryKey: ["activity-feed"], queryFn: api.fetchActivityFeed, refetchInterval: 15_000 });
}
