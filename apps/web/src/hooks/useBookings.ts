import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/bookings";
import type { OriginalsInput } from "@/services/api/originals";

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

export function useAdminCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.AdminCreateBookingInput) => api.adminCreateBooking(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pickup-queue"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useConfirmPickup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, vehicleId, originals }: { bookingId: string; vehicleId?: string; originals: OriginalsInput }) =>
      api.confirmPickup(bookingId, vehicleId, originals),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pickup-queue"] });
      // the rider's "originals held" card must show what was just taken
      qc.invalidateQueries({ queryKey: ["rider-originals"] });
    },
  });
}

export function useAdminCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason: string }) =>
      api.adminCancelBooking(bookingId, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pickup-queue"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}

export function useSetLateFeeOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, lateFeeOverride }: { bookingId: string; lateFeeOverride: number | null }) =>
      api.setLateFeeOverride(bookingId, lateFeeOverride),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pickup-queue"] }),
  });
}
