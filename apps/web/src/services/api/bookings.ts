import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AvailableVehicle, BookingPlanStatus, BookingStatus, PaginatedResult, PickupBooking } from "@/types";

export interface PickupQueueFilters {
  stationId?: string;
  /** Omit to see every status (the "All" tab) — no default is applied server-side. */
  status?: BookingStatus;
  /** Further narrows a 'fulfilled' view into Active/Due/Paused. Ignored for any other status. */
  planStatus?: BookingPlanStatus;
  page?: number;
  pageSize?: number;
}

/** GET /bookings — requireStaff. Omit status/planStatus for the "All" tab; pass either for any other stage. */
export async function fetchBookings(filters: PickupQueueFilters = {}): Promise<PaginatedResult<PickupBooking>> {
  const { stationId, status, planStatus, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<PickupBooking>>("/bookings", {
    page,
    pageSize,
    stationId,
    status,
    planStatus,
  });
  return toPaginatedResult(res);
}

/** GET /bookings/:id/available-vehicles — vehicles free to hand over at this booking's station, for manual override. */
export async function fetchAvailableVehicles(bookingId: string): Promise<AvailableVehicle[]> {
  return apiClient.get<AvailableVehicle[]>(`/bookings/${bookingId}/available-vehicles`);
}

/** POST /bookings/:id/pickup — confirms handover. Omit vehicleId to use the already-allocated vehicle. */
export async function confirmPickup(bookingId: string, vehicleId?: string) {
  return apiClient.post(`/bookings/${bookingId}/pickup`, { vehicle_id: vehicleId });
}
