import { apiClient } from "./httpClient";

export interface ReturnRecoverySettings {
  id: string;
  max_late_fee_days: number;
  late_fee_per_day: number;
  updated_at: string | null;
}

export interface UpdateReturnRecoverySettingsInput {
  max_late_fee_days: number;
  late_fee_per_day: number;
}

/** GET /return-recovery-settings — requireAdmin. Singleton — one row. */
export async function fetchReturnRecoverySettings(): Promise<ReturnRecoverySettings> {
  return apiClient.get<ReturnRecoverySettings>("/return-recovery-settings");
}

/** PUT /return-recovery-settings — requireAdmin. */
export async function updateReturnRecoverySettings(input: UpdateReturnRecoverySettingsInput): Promise<ReturnRecoverySettings> {
  return apiClient.put<ReturnRecoverySettings>("/return-recovery-settings", input);
}
