import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Vehicle, VehicleDetail, VehiclePhoto, VehicleStatus } from "@/types";

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

/** GET /vehicles/:id — includes documents, photos, maintenance/rental history, and the current rider (if any). */
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
  color?: string;
  qr_code?: string;
  imei?: string;
  purchase_date?: string;
  insurance_number?: string;
  insurance_expiry?: string;
}

/** POST /vehicles — requireStaff. */
export async function createVehicle(input: VehicleFormInput): Promise<Vehicle> {
  return apiClient.post<Vehicle>("/vehicles", input);
}

/** PATCH /vehicles/:id — requireStaff. Accepts any subset of the create fields. */
export async function updateVehicle(id: string, patch: Partial<VehicleFormInput>): Promise<Vehicle> {
  return apiClient.patch<Vehicle>(`/vehicles/${id}`, patch);
}

/** POST /vehicles/:id/photos — requireStaff. Multipart upload. */
export async function uploadVehiclePhoto(id: string, file: File, isPrimary = false): Promise<VehiclePhoto> {
  const form = new FormData();
  form.append("photo", file);
  if (isPrimary) form.append("is_primary", "true");
  return apiClient.postForm<VehiclePhoto>(`/vehicles/${id}/photos`, form);
}

/** DELETE /vehicles/:id/photos/:photoId — requireStaff. */
export async function deleteVehiclePhoto(id: string, photoId: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}/photos/${photoId}`);
}

export interface ScrapVehicleInput {
  reason: string;
  estimated_value?: number;
  scrapped_on?: string;
}

/** POST /vehicles/:id/scrap — requireStaff. Only a 'maintenance' vehicle may be scrapped. */
export async function scrapVehicle(id: string, input: ScrapVehicleInput): Promise<Vehicle> {
  return apiClient.post<Vehicle>(`/vehicles/${id}/scrap`, input);
}

/** POST /vehicles/:id/assign-to-user — requireStaff. Direct handover, no booking involved. */
export async function assignVehicleToUser(id: string, userId: string): Promise<Vehicle> {
  return apiClient.post<Vehicle>(`/vehicles/${id}/assign-to-user`, { user_id: userId });
}
