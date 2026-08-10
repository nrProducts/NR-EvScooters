import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/deposits";

export function useDeposits(filters: api.DepositFilters) {
  return useQuery({ queryKey: ["deposits", filters], queryFn: () => api.fetchDeposits(filters) });
}

export function useDepositForBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["deposit", bookingId],
    queryFn: () => api.fetchDepositForBooking(bookingId!),
    enabled: !!bookingId,
  });
}
