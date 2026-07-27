import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AdminRental, PaginatedResult, RentalStatus } from "@/types";

export interface RentalFilters {
  status?: RentalStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /rentals — requireStaff. See apps/backend/src/modules/rentals/rentals.routes.ts */
export async function fetchRentals(filters: RentalFilters = {}): Promise<PaginatedResult<AdminRental>> {
  const { status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<AdminRental>>("/rentals", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /rentals/:id */
export async function fetchRentalById(id: string): Promise<AdminRental> {
  return apiClient.get<AdminRental>(`/rentals/${id}`);
}

/** POST /rentals/:id/complete — requireStaff. Vehicle auto-returns to 'available' via a DB trigger. */
export async function completeRide(id: string, endBatteryPct?: number): Promise<AdminRental> {
  return apiClient.post<AdminRental>(`/rentals/${id}/complete`, { end_battery_pct: endBatteryPct });
}

/** POST /rentals/:id/maintenance — requireStaff. Ends the ride and opens a maintenance ticket instead of freeing the vehicle. */
export async function moveRideToMaintenance(id: string, description: string, endBatteryPct?: number): Promise<AdminRental> {
  return apiClient.post<AdminRental>(`/rentals/${id}/maintenance`, { description, end_battery_pct: endBatteryPct });
}
