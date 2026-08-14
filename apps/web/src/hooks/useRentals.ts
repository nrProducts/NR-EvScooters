import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/rentals";

/**
 * Every rental-settling mutation (complete/maintenance/reject-return) also
 * changes what the booking-keyed Rental Operations list shows — a booking's
 * status, its active_rental.return_requested_at, or both — so that list
 * needs invalidating alongside the vehicle it touches.
 */
function invalidateAfterRentalMutation(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["vehicles"] });
  qc.invalidateQueries({ queryKey: ["vehicle"] });
  qc.invalidateQueries({ queryKey: ["pickup-queue"] });
}

export function useCompleteRide() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input?: api.CompleteRideInput }) => api.completeRide(id, input),
    onSuccess: () => invalidateAfterRentalMutation(qc),
  });
}

export function useMoveRideToMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.MoveToMaintenanceInput }) =>
      api.moveRideToMaintenance(id, input),
    onSuccess: () => {
      invalidateAfterRentalMutation(qc);
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

export function useRejectReturn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.RejectReturnInput }) => api.rejectReturn(id, input),
    onSuccess: () => invalidateAfterRentalMutation(qc),
  });
}
