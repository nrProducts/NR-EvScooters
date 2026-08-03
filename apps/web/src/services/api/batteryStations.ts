import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";
import type {
  AdminStationFilters, BatteryStation, BatteryStationSummary, CreateStationPayload,
  MobileStationFilters, UpdateStationPayload,
} from "@/types/batteryStation";

/**
 * The only module in the console that talks to /battery-stations. Grids,
 * forms and the map picker call these functions (through useBatteryStations)
 * and never touch apiClient themselves.
 *
 * Endpoint paths are relative to VITE_API_BASE_URL, which already includes
 * /api/v1 — see httpClient.ts.
 */

/** GET /battery-stations — any authenticated user; admins also see hidden stations. */
export async function getMobileStations(filters: MobileStationFilters = {}): Promise<BatteryStation[]> {
  const res = await apiClient.get<{ data: BatteryStation[] }>("/battery-stations", {
    status: filters.status,
    search: filters.search || undefined,
    latitude: filters.latitude,
    longitude: filters.longitude,
    radiusKm: filters.radiusKm,
  });
  return res.data;
}

/** GET /battery-stations/:id */
export async function getStationById(id: string): Promise<BatteryStation> {
  return apiClient.get<BatteryStation>(`/battery-stations/${id}`);
}

/** GET /admin/battery-stations — requireAdmin. */
export async function getAdminStations(filters: AdminStationFilters = {}): Promise<PaginatedResult<BatteryStation>> {
  const { page = 1, pageSize = 10, search, status, visibility, sortBy = "serialNumber", sortDir = "asc" } = filters;
  const res = await apiClient.get<BackendPaginated<BatteryStation>>("/admin/battery-stations", {
    page,
    pageSize,
    search: search?.trim() || undefined,
    // buildQuery drops "all" for us, but being explicit keeps the intent
    // readable at the call site rather than hidden in the client.
    status: status && status !== "all" ? status : undefined,
    visibility: visibility && visibility !== "all" ? visibility : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** GET /admin/battery-stations/summary — requireAdmin. Backs the four cards. */
export async function getStationSummary(): Promise<BatteryStationSummary> {
  return apiClient.get<BatteryStationSummary>("/admin/battery-stations/summary");
}

/** POST /admin/battery-stations — requireAdmin. */
export async function createStation(payload: CreateStationPayload): Promise<BatteryStation> {
  return apiClient.post<BatteryStation>("/admin/battery-stations", payload);
}

/** PATCH /admin/battery-stations/:id — requireAdmin. Partial update. */
export async function updateStation(id: string, payload: UpdateStationPayload): Promise<BatteryStation> {
  return apiClient.patch<BatteryStation>(`/admin/battery-stations/${id}`, payload);
}

/** PATCH /admin/battery-stations/:id/visibility — requireAdmin. */
export async function updateStationVisibility(id: string, isVisible: boolean): Promise<BatteryStation> {
  return apiClient.patch<BatteryStation>(`/admin/battery-stations/${id}/visibility`, {
    isVisibleOnMobile: isVisible,
  });
}

/** DELETE /admin/battery-stations/:id — requireAdmin. Soft delete; returns 204. */
export async function deleteStation(id: string): Promise<void> {
  await apiClient.delete<void>(`/admin/battery-stations/${id}`);
}
