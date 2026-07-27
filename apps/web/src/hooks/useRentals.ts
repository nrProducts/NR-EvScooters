import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/rentals";

export function useRentals(filters: api.RentalFilters) {
  return useQuery({ queryKey: ["rentals", filters], queryFn: () => api.fetchRentals(filters) });
}

export function useRental(id: string | undefined) {
  return useQuery({
    queryKey: ["rental", id],
    queryFn: () => api.fetchRentalById(id!),
    enabled: !!id,
  });
}

export function useCompleteRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, endBatteryPct }: { id: string; endBatteryPct?: number }) => api.completeRide(id, endBatteryPct),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useMoveRideToMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, description, endBatteryPct }: { id: string; description: string; endBatteryPct?: number }) =>
      api.moveRideToMaintenance(id, description, endBatteryPct),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}
