import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { BillingCycle, PaginatedResult, Plan } from "@/types";

export interface PlanFilters {
  vehicleModelId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PlanInput {
  name: string;
  billing_cycle: BillingCycle;
  price: number;
  duration_days: number;
  deposit_amount: number;
  vehicle_model_id: string;
  included_minutes?: number;
  active?: boolean;
}

/** GET /plans — requireAdmin. See apps/backend/src/modules/plans/plans.routes.ts */
export async function fetchPlans(filters: PlanFilters = {}): Promise<PaginatedResult<Plan>> {
  const { vehicleModelId, active, page = 1, pageSize = 20 } = filters;
  const res = await apiClient.get<BackendPaginated<Plan>>("/plans", {
    page, pageSize, vehicleModelId, active,
  });
  return toPaginatedResult(res);
}

export async function fetchPlanById(id: string): Promise<Plan> {
  return apiClient.get<Plan>(`/plans/${id}`);
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  return apiClient.post<Plan>("/plans", input);
}

export async function updatePlan(id: string, patch: Partial<PlanInput>): Promise<Plan> {
  return apiClient.patch<Plan>(`/plans/${id}`, patch);
}
