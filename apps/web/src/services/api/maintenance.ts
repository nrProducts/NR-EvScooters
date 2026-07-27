import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { MaintenanceStatus, MaintenanceTicket, PaginatedResult } from "@/types";

export interface MaintenanceFilters {
  status?: MaintenanceStatus | "all";
  vehicleId?: string;
  page?: number;
  pageSize?: number;
}

/** GET /maintenance — requireStaff. See apps/backend/src/modules/maintenance/maintenance.routes.ts */
export async function fetchMaintenanceTickets(filters: MaintenanceFilters = {}): Promise<PaginatedResult<MaintenanceTicket>> {
  const { status, vehicleId, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<MaintenanceTicket>>("/maintenance", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    vehicleId,
  });
  return toPaginatedResult(res);
}

export interface CreateMaintenanceInput {
  vehicle_id: string;
  description: string;
  status?: MaintenanceStatus;
}

/** POST /maintenance — requireStaff. */
export async function createMaintenanceTicket(input: CreateMaintenanceInput): Promise<MaintenanceTicket> {
  return apiClient.post<MaintenanceTicket>("/maintenance", input);
}

/** PATCH /maintenance/:id — requireStaff. resolved_at is derived server-side from the status change. */
export async function updateMaintenanceTicket(
  id: string,
  patch: { status?: MaintenanceStatus; description?: string },
): Promise<MaintenanceTicket> {
  return apiClient.patch<MaintenanceTicket>(`/maintenance/${id}`, patch);
}
