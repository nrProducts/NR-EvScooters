import { apiClient } from "./httpClient";

export interface CancellationTier {
  id: string;
  upto_minutes: number;
  penalty_percent: number;
  updated_at: string | null;
}

export interface CancellationTierInput {
  upto_minutes: number;
  penalty_percent: number;
}

/** GET /cancellation-tiers — any authenticated user. Sorted by upto_minutes asc. */
export async function fetchCancellationTiers(): Promise<CancellationTier[]> {
  return apiClient.get<CancellationTier[]>("/cancellation-tiers");
}

/** PUT /cancellation-tiers — requireAdmin. Replaces the whole policy. */
export async function replaceCancellationTiers(tiers: CancellationTierInput[]): Promise<CancellationTier[]> {
  return apiClient.put<CancellationTier[]>("/cancellation-tiers", { tiers });
}
