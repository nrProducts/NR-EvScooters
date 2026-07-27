import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Vehicle, VehicleDetail, VehicleStatus } from "@/types";

export interface VehicleFilters {
  search?: string;
  status?: VehicleStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /vehicles — requireStaff. See apps/backend/src/modules/vehicles/vehicles.routes.ts */
export async function fetchVehicles(filters: VehicleFilters = {}): Promise<PaginatedResult<Vehicle>> {
  const { search, status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<Vehicle>>("/vehicles", {
    page,
    pageSize,
    search,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /vehicles/:id — includes documents, maintenance/rental history, and the current rider (if any). */
export async function fetchVehicleById(id: string): Promise<VehicleDetail> {
  return apiClient.get<VehicleDetail>(`/vehicles/${id}`);
}

export interface VehicleFormInput {
  name: string;
  registration_number: string;
  battery_number: string;
  manufacturer: string;
  model: string;
  vin: string;
  battery_percentage?: number;
  status?: VehicleStatus;
  last_service_date?: string;
  next_service_due_date?: string;
}

/** POST /vehicles — requireStaff. */
export async function createVehicle(input: VehicleFormInput): Promise<Vehicle> {
  return apiClient.post<Vehicle>("/vehicles", input);
}

/** PATCH /vehicles/:id — requireStaff. Accepts any subset of the create fields. */
export async function updateVehicle(id: string, patch: Partial<VehicleFormInput>): Promise<Vehicle> {
  return apiClient.patch<Vehicle>(`/vehicles/${id}`, patch);
}
