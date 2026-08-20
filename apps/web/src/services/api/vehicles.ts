import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Vehicle, VehicleDetail, VehicleStatus } from "@/types";

export interface VehicleFilters {
  search?: string;
  status?: VehicleStatus | "all";
  page?: number;
  pageSize?: number;
  /** `battery_percentage` and `next_service_due_date` are gone — no columns back them. */
  sortBy?: "created_at" | "display_name" | "registration_number";
  sortDir?: "asc" | "desc";
}

/** GET /vehicles — requireStaff. See apps/backend/src/modules/vehicles/vehicles.routes.ts */
export async function fetchVehicles(filters: VehicleFilters = {}): Promise<PaginatedResult<Vehicle>> {
  const { search, status, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<Vehicle>>("/vehicles", {
    page,
    pageSize,
    search,
    status: status && status !== "all" ? status : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** GET /vehicles/:id — includes documents, photos, maintenance/rental history, and the current rider (if any). */
export async function fetchVehicleById(id: string): Promise<VehicleDetail> {
  return apiClient.get<VehicleDetail>(`/vehicles/${id}`);
}

/**
 * What POST /vehicles accepts.
 *
 * `model` is chosen by id now — the model is a row, and the vehicle points at
 * it — and `status` is not accepted at all: `recompute_vehicle_status()`
 * derives it from the vehicle's maintenance ticket, rental assignment and
 * booking hold, so a value sent here would be overwritten and, worse, would
 * disagree with the facts it claims to summarise.
 *
 * Insurance moved to `vehicle_documents` and service dates are derived from
 * maintenance tickets, so neither is set from this form any more.
 */
export interface VehicleFormInput {
  /** Stored as `display_name`. Optional — a vehicle can just be its plate. */
  name?: string;
  registration_number: string;
  vin: string;
  vehicle_model_id: string;
  hub_id?: string;
  color?: string;
  qr_code?: string;
  imei?: string;
  purchase_date?: string;
}

/** The model a vehicle belongs to is fixed at creation. */
export type VehicleUpdateInput = Partial<Omit<VehicleFormInput, "vehicle_model_id">>;

/** POST /vehicles — requireStaff. */
export async function createVehicle(input: VehicleFormInput): Promise<Vehicle> {
  return apiClient.post<Vehicle>("/vehicles", input);
}

/** PATCH /vehicles/:id — requireStaff. Accepts any subset of the create fields. */
export async function updateVehicle(id: string, patch: VehicleUpdateInput): Promise<Vehicle> {
  return apiClient.patch<Vehicle>(`/vehicles/${id}`, patch);
}

/*
 * The photo endpoints are gone with the `vehicle_photos` table.
 *
 * A photo of a SCOOTER was a photo of its model — the same six studio shots
 * re-uploaded per unit — so the imagery lives on `vehicle_model_media` and is
 * shown once for the model. Condition photographs, the genuinely per-unit
 * kind, are `incidents.photo_paths`, where they sit next to the damage they
 * evidence.
 */

export interface ScrapVehicleInput {
  reason: string;
  estimated_value?: number;
  scrapped_on?: string;
}

/** POST /vehicles/:id/scrap — requireStaff. Only a 'maintenance' vehicle may be scrapped. */
export async function scrapVehicle(id: string, input: ScrapVehicleInput): Promise<Vehicle> {
  return apiClient.post<Vehicle>(`/vehicles/${id}/scrap`, input);
}

/**
 * POST /vehicles/:id/assign-to-user — requireStaff. Direct handover, no booking involved.
 * If the rider already holds a different vehicle, the backend 409s (ApiError.fields carries
 * the existing vehicle's name/id) unless `unassignExisting` is passed to close that rental first.
 */
export async function assignVehicleToUser(id: string, userId: string, unassignExisting?: boolean): Promise<Vehicle> {
  return apiClient.post<Vehicle>(`/vehicles/${id}/assign-to-user`, {
    user_id: userId,
    unassign_existing: unassignExisting,
  });
}
