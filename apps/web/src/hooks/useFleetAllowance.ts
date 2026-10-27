import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/fleetAllowance";

/**
 * Fleet kilometre allowance: how much of the month's limit the fleet has used.
 * The odometers behind it refresh every 5 minutes, so a short poll is plenty.
 */
export function useFleetAllowance() {
  return useQuery({
    queryKey: ["fleet-allowance"],
    queryFn: api.fetchFleetAllowance,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useUpdateFleetAllowance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.AllowanceSettings) => api.updateFleetAllowance(input),
    onSuccess: (data) => qc.setQueryData(["fleet-allowance"], data),
  });
}
