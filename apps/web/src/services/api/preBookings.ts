import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, PreBooking } from "@/types";

export interface PreBookingFilters {
  page?: number;
  pageSize?: number;
}

/** GET /pre-bookings — requireStaff. See apps/backend/src/modules/public/preBookings.admin.routes.ts */
export async function fetchPreBookings(filters: PreBookingFilters = {}): Promise<PaginatedResult<PreBooking>> {
  const { page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<PreBooking>>("/pre-bookings", { page, pageSize });
  return toPaginatedResult(res);
}
