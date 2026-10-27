import { apiClient } from "./httpClient";

/** Mirrors apps/backend/src/modules/fleet-allowance. */
export type BikeUsageState = "ok" | "not_started" | "awaiting_start" | "no_odometer" | "no_closing";

export interface AllowanceTotals {
  days_total: number;
  days_elapsed: number;
  days_left: number;
  period_status: "upcoming" | "running" | "ended";
  vehicle_count: number;
  fleet_limit_km: number;
  used_km: number;
  remaining_km: number;
  percent_used: number;
  /** Where the fleet lands at the end of the period at the pace so far. */
  projected_km: number;
  projected_percent: number;
  /** Bikes whose starting odometer has not been captured yet. */
  awaiting_start: number;
  /** Bikes with no odometer reading (not tracked). */
  no_odometer: number;
}

export interface AllowanceVehicle {
  id: string;
  name: string | null;
  registration_number: string;
  status: string;
  model: string | null;
  state: BikeUsageState;
  used_km: number;
  limit_km: number;
  percent_of_limit: number;
  odometer_km: number | null;
}

export interface AllowanceSettings {
  period_start: string;
  period_end: string;
  km_per_vehicle: number;
}

export interface AllowanceSummary {
  settings: AllowanceSettings & { updated_at: string | null; updated_by: { id: string; full_name: string } | null };
  today: string;
  totals: AllowanceTotals;
  vehicles: AllowanceVehicle[];
}

/** GET /fleet-allowance */
export async function fetchFleetAllowance(): Promise<AllowanceSummary> {
  return apiClient.get<AllowanceSummary>("/fleet-allowance");
}

/** PUT /fleet-allowance — ADMIN ONLY. */
export async function updateFleetAllowance(input: AllowanceSettings): Promise<AllowanceSummary> {
  return apiClient.put<AllowanceSummary>("/fleet-allowance", input);
}
