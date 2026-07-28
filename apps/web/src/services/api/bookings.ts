import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AvailableVehicle, BookingStatus, PaginatedResult, PickupBooking } from "@/types";

export interface PickupQueueFilters {
  stationId?: string;
  /** Omit for the original "awaiting pickup" behavior (confirmed only). */
  status?: BookingStatus;
  page?: number;
  pageSize?: number;
}

/** GET /bookings — requireStaff. Defaults to 'confirmed' (awaiting pickup); pass status for any other stage. */
export async function fetchBookings(filters: PickupQueueFilters = {}): Promise<PaginatedResult<PickupBooking>> {
  const { stationId, status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<PickupBooking>>("/bookings", {
    page,
    pageSize,
    stationId,
    status,
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
