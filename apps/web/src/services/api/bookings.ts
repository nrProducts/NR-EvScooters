import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AvailableVehicle, PaginatedResult, PickupBooking } from "@/types";

export interface PickupQueueFilters {
  stationId?: string;
  page?: number;
  pageSize?: number;
}

/**
 * GET /bookings — requireStaff. NOTE: despite the generic name this is
 * specifically the *pickup queue* (bookings awaiting a vehicle handover) —
 * see apps/backend/src/modules/bookings/bookings.routes.ts. There is no
 * general "all bookings by any status" admin endpoint yet, so this console
 * can't show upcoming/completed/cancelled bookings — only what's next up
 * for pickup.
 */
export async function fetchPickupQueue(filters: PickupQueueFilters = {}): Promise<PaginatedResult<PickupBooking>> {
  const { stationId, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<PickupBooking>>("/bookings", {
    page,
    pageSize,
    stationId,
  });
  return toPaginatedResult(res);
}

/** GET /bookings/:id/available-vehicles — vehicles free to hand over at this booking's station. */
export async function fetchAvailableVehicles(bookingId: string): Promise<AvailableVehicle[]> {
  return apiClient.get<AvailableVehicle[]>(`/bookings/${bookingId}/available-vehicles`);
}

/** POST /bookings/:id/pickup — confirms handover of a specific vehicle. */
export async function confirmPickup(bookingId: string, vehicleId: string) {
  return apiClient.post(`/bookings/${bookingId}/pickup`, { vehicle_id: vehicleId });
}
