import { apiClient } from "./httpClient";

export interface VehicleModelOption {
  id: string;
  name: string;
}

/**
 * GET /plans/vehicle-model-options — requireAdmin. Every active vehicle
 * model, for the plan editor's model picker. Deliberately NOT the rider
 * catalog endpoint (/vehicle-models) — that one only lists models that
 * already have an active plan, which makes it impossible to ever create a
 * model's first plan.
 */
export async function fetchVehicleModelOptions(): Promise<VehicleModelOption[]> {
  return apiClient.get<VehicleModelOption[]>("/plans/vehicle-model-options");
}
