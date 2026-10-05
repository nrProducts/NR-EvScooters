import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/revenue";
import type { DateRange } from "@/lib/period";

const KEY = "revenue";

export function useRevenueSummary(range: DateRange, compare?: DateRange) {
  return useQuery({
    queryKey: [KEY, "summary", range, compare ?? null],
    queryFn: () => api.fetchRevenueSummary(range, compare),
  });
}

export function useRevenueTrend(range: DateRange, granularity: api.RevenueGranularity) {
  return useQuery({
    queryKey: [KEY, "trend", range, granularity],
    queryFn: () => api.fetchRevenueTrend(range, granularity),
  });
}

export function useRevenueByType(range: DateRange) {
  return useQuery({ queryKey: [KEY, "by-type", range], queryFn: () => api.fetchRevenueByType(range) });
}

export function useRevenueByMethod(range: DateRange) {
  return useQuery({ queryKey: [KEY, "by-method", range], queryFn: () => api.fetchRevenueByMethod(range) });
}

export function useRevenueRefunds(range: DateRange) {
  return useQuery({ queryKey: [KEY, "refunds", range], queryFn: () => api.fetchRevenueRefunds(range) });
}

export function useRevenueDeposits(range: DateRange) {
  return useQuery({ queryKey: [KEY, "deposits", range], queryFn: () => api.fetchRevenueDeposits(range) });
}

export function useRevenueTransactions(filters: api.RevenueTransactionFilters) {
  return useQuery({
    queryKey: [KEY, "transactions", filters],
    queryFn: () => api.fetchRevenueTransactions(filters),
  });
}
