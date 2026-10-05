import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/preBookings";

export function usePreBookings(filters: api.PreBookingFilters) {
  return useQuery({ queryKey: ["pre-bookings", filters], queryFn: () => api.fetchPreBookings(filters) });
}
