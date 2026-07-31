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

/** POST /maintenance/:id/quick-fix — requireStaff. Same-day repair, no temp vehicle. */
export async function triageQuickFix(id: string, expectedReadyAt: string): Promise<MaintenanceTicket> {
  return apiClient.post<MaintenanceTicket>(`/maintenance/${id}/quick-fix`, { expected_ready_at: expectedReadyAt });
}

/** POST /maintenance/:id/temp-vehicle — requireStaff. Hands the displaced rider a temp vehicle. */
export async function assignTempVehicle(id: string, tempVehicleId: string): Promise<MaintenanceTicket> {
  return apiClient.post<MaintenanceTicket>(`/maintenance/${id}/temp-vehicle`, { temp_vehicle_id: tempVehicleId });
}

export interface NotRepairableInput {
  reason: string;
  estimated_value?: number;
  scrapped_on?: string;
}

/** POST /maintenance/:id/not-repairable — requireStaff. Scraps the vehicle and closes the ticket. */
export async function resolveNotRepairable(id: string, input: NotRepairableInput): Promise<MaintenanceTicket> {
  return apiClient.post<MaintenanceTicket>(`/maintenance/${id}/not-repairable`, input);
}

/** POST /maintenance/:id/reassign — requireStaff. Permanently hands the displaced rider a new vehicle. */
export async function reassignAfterScrap(id: string, replacementVehicleId: string): Promise<MaintenanceTicket> {
  return apiClient.post<MaintenanceTicket>(`/maintenance/${id}/reassign`, {
    replacement_vehicle_id: replacementVehicleId,
  });
}
