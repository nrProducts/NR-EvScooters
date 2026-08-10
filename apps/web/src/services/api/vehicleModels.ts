import { apiClient, type BackendPaginated } from "./httpClient";

export interface VehicleModelOption {
  id: string;
  name: string;
}

/**
 * GET /vehicle-models — requireAuth (no staff gate). Only used here to
 * populate the plan-editor's model picker, so a minimal shape suffices.
 * Note: the backend only returns models that already have an active plan
 * (rider-catalog behavior) — a brand-new model with no plan yet won't show
 * up here until it has one.
 */
export async function fetchVehicleModelOptions(): Promise<VehicleModelOption[]> {
  const res = await apiClient.get<BackendPaginated<VehicleModelOption>>("/vehicle-models", { pageSize: 100 });
  return res.data;
}
