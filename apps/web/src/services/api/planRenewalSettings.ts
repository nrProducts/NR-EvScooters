import { apiClient } from "./httpClient";

export interface PlanRenewalSettings {
  id: string;
  late_fee_enabled: boolean;
  late_fee_amount: number;
  updated_at: string | null;
}

export interface UpdatePlanRenewalSettingsInput {
  late_fee_enabled: boolean;
  late_fee_amount: number;
}

/** GET /plan-renewal-settings — requireAdmin. Singleton — one row. */
export async function fetchPlanRenewalSettings(): Promise<PlanRenewalSettings> {
  return apiClient.get<PlanRenewalSettings>("/plan-renewal-settings");
}

/** PUT /plan-renewal-settings — requireAdmin. */
export async function updatePlanRenewalSettings(input: UpdatePlanRenewalSettingsInput): Promise<PlanRenewalSettings> {
  return apiClient.put<PlanRenewalSettings>("/plan-renewal-settings", input);
}
