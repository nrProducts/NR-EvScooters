import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult, Vehicle, VehicleDetail, VehicleDocument, VehicleDocumentType, VehicleStatus } from "@/types";

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
  batch_number?: string;
}

/**
 * PATCH /vehicles/:id body. The model is fixed at creation and the backend's
 * schema is strict, so `vehicle_model_id` must never be sent (it 400s with
 * "Unrecognized key"). `null` clears an optional field.
 */
export interface VehicleUpdateInput {
  name?: string | null;
  registration_number?: string;
  vin?: string;
  hub_id?: string | null;
  color?: string | null;
  qr_code?: string | null;
  imei?: string | null;
  purchase_date?: string | null;
  batch_number?: string | null;
}

/**
 * The edit form's values → a PATCH body. Built field by field rather than by
 * spreading the form, so nothing the update endpoint rejects (the model) can
 * leak through. The form is pre-filled, so an optional field that comes back
 * empty was cleared by the admin and is sent as null.
 */
export function toVehicleUpdate(form: VehicleFormInput): VehicleUpdateInput {
  return {
    name: form.name || null,
    registration_number: form.registration_number,
    vin: form.vin,
    hub_id: form.hub_id || null,
    color: form.color || null,
    qr_code: form.qr_code || null,
    imei: form.imei || null,
    purchase_date: form.purchase_date || null,
    batch_number: form.batch_number || null,
  };
}

export interface HubOption {
  id: string;
  code: string;
  name: string;
}

/**
 * GET /vehicles/hub-options — active hubs for the vehicle form's picker. A
 * vehicle is only bookable at its hub (availability is matched on model + hub),
 * so a unit without one never reaches a rider.
 */
export async function fetchHubOptions(): Promise<HubOption[]> {
  return apiClient.get<HubOption[]>("/vehicles/hub-options");
}

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
 * POST /vehicles/:id/unassign — requireStaff. Reclaims the vehicle from its
 * current rider by opening the same return-review flow a rider's own
 * "Request Return" would (Inspection → Payment Gate → Approve Return,
 * maintenance-or-available choice included). Returns the rental id so the
 * caller can navigate straight to that review page.
 */
export async function unassignVehicle(id: string, reason: string): Promise<{ rentalId: string }> {
  return apiClient.post<{ rentalId: string }>(`/vehicles/${id}/unassign`, { reason });
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

// --- vehicle documents (RC / insurance / PUC / fitness / permit) --------

export interface VehicleDocumentFormInput {
  doc_type: VehicleDocumentType;
  doc_number: string;
  issued_on?: string;
  expires_on: string;
  /** Optional — a document can be recorded with no file yet, same as it can today with none of this UI. */
  file?: File;
}

/** POST /vehicles/:id/documents — requireStaff, multipart. */
export async function createVehicleDocument(vehicleId: string, input: VehicleDocumentFormInput): Promise<VehicleDocument> {
  const form = new FormData();
  form.append("doc_type", input.doc_type);
  form.append("doc_number", input.doc_number);
  if (input.issued_on) form.append("issued_on", input.issued_on);
  form.append("expires_on", input.expires_on);
  if (input.file) form.append("file", input.file);
  return apiClient.postForm<VehicleDocument>(`/vehicles/${vehicleId}/documents`, form);
}

export interface VehicleDocumentUpdateInput {
  doc_number: string;
  /** null clears a previously recorded issue date. */
  issued_on: string | null;
  expires_on: string;
  /** A replacement file. Omitted keeps the current file. */
  file?: File;
}

/**
 * PATCH /vehicles/documents/:documentId — requireStaff, multipart. The type
 * is fixed once recorded; number, dates and the file can change. A new file
 * replaces the old one, which the backend deletes once the update commits.
 */
export async function updateVehicleDocument(documentId: string, input: VehicleDocumentUpdateInput): Promise<VehicleDocument> {
  const form = new FormData();
  form.append("doc_number", input.doc_number);
  form.append("issued_on", input.issued_on ?? "");
  form.append("expires_on", input.expires_on);
  if (input.file) form.append("file", input.file);
  return apiClient.patchForm<VehicleDocument>(`/vehicles/documents/${documentId}`, form);
}

/** DELETE /vehicles/documents/:documentId — requireStaff. */
export async function deleteVehicleDocument(documentId: string): Promise<void> {
  await apiClient.delete(`/vehicles/documents/${documentId}`);
}

/** GET /vehicles/documents/:documentId/url — requireStaff. Short-lived signed URL for the file. */
export async function getVehicleDocumentUrl(documentId: string): Promise<string> {
  const { url } = await apiClient.get<{ url: string }>(`/vehicles/documents/${documentId}/url`);
  return url;
}

// ---------------------------------------------------------------------------
// Bulk import — template → preview (nothing saved) → confirm → commit.
// See apps/backend/src/modules/vehicles/vehicles.import.ts
// ---------------------------------------------------------------------------

/** One spreadsheet row as typed, plus what the server made of it. */
export interface VehicleImportRow {
  /** The row number in the spreadsheet, so errors point at the row the admin sees. */
  row: number;
  registration_number: string | null;
  vin: string | null;
  model: string | null;
  name: string | null;
  hub_code: string | null;
  color: string | null;
  qr_code: string | null;
  imei: string | null;
  purchase_date: string | null;
  batch_number: string | null;
  vehicle_model_id: string | null;
  hub_id: string | null;
  /** Empty when the row can be imported. */
  errors: string[];
}

export interface VehicleImportPreview {
  total: number;
  valid: number;
  invalid: number;
  rows: VehicleImportRow[];
}

export interface VehicleImportResult {
  created: number;
  vehicles: { id: string; registration_number: string }[];
}

/** GET /vehicles/import/template — saves the .xlsx with live models and hub codes as dropdowns. */
export async function downloadVehicleImportTemplate(): Promise<void> {
  const { blob, filename } = await apiClient.getBlob("/vehicles/import/template");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** POST /vehicles/import/preview — checks every row; writes nothing. */
export async function previewVehicleImport(file: File): Promise<VehicleImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiClient.postForm<VehicleImportPreview>("/vehicles/import/preview", form);
}

/** POST /vehicles/import/commit — the server re-checks these rows, then saves all of them or none. */
export async function commitVehicleImport(rows: VehicleImportRow[]): Promise<VehicleImportResult> {
  return apiClient.post<VehicleImportResult>("/vehicles/import/commit", {
    rows: rows.map((r) => ({
      row: r.row, registration_number: r.registration_number, vin: r.vin, model: r.model, name: r.name,
      hub_code: r.hub_code, color: r.color, qr_code: r.qr_code, imei: r.imei,
      purchase_date: r.purchase_date, batch_number: r.batch_number,
    })),
  });
}
