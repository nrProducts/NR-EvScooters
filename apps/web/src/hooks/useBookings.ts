import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/bookings";

export function useBookings(filters: api.BookingFilters) {
  return useQuery({ queryKey: ["bookings", filters], queryFn: () => api.fetchBookings(filters) });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: ["booking", id],
    queryFn: () => api.fetchBookingById(id!),
    enabled: !!id,
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelBooking(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
