import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/rentals";

function invalidateVehicles(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vehicles"] });
  qc.invalidateQueries({ queryKey: ["vehicle"] });
}

export function useCompleteRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: api.CompleteRideInput }) => api.completeRide(id, input),
    onSuccess: () => invalidateVehicles(qc),
  });
}

export function useMoveRideToMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.MoveToMaintenanceInput }) =>
      api.moveRideToMaintenance(id, input),
    onSuccess: () => {
      invalidateVehicles(qc);
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}
