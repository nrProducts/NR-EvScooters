import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/cancellationTiers";

export function useCancellationTiers() {
  return useQuery({ queryKey: ["cancellation-tiers"], queryFn: api.fetchCancellationTiers });
}

export function useReplaceCancellationTiers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tiers: api.CancellationTierInput[]) => api.replaceCancellationTiers(tiers),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cancellation-tiers"] }),
  });
}
