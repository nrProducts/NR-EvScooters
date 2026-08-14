import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/bookings";

export function usePickupQueue(filters: api.PickupQueueFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["pickup-queue", filters],
    queryFn: () => api.fetchBookings(filters),
    enabled: options?.enabled ?? true,
  });
}

export function useAvailableVehicles(bookingId: string | undefined) {
  return useQuery({
    queryKey: ["available-vehicles", bookingId],
    queryFn: () => api.fetchAvailableVehicles(bookingId!),
    enabled: !!bookingId,
  });
}

export function useConfirmPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, vehicleId }: { bookingId: string; vehicleId?: string }) =>
      api.confirmPickup(bookingId, vehicleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pickup-queue"] }),
  });
}
