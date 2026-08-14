import { apiClient } from "./httpClient";
import type { ConsentPurpose, UserConsentRecord } from "@/types";

/**
 * GET /consent/users/:userId — requireStaff.
 *
 * Reading someone's consent record is itself a read of their personal data,
 * so the backend writes a pii_access_log entry for this call. Do not add a
 * "prefetch consent for the whole list" call without revisiting that.
 */
export async function fetchUserConsents(userId: string): Promise<UserConsentRecord> {
  return apiClient.get<UserConsentRecord>(`/consent/users/${userId}`);
}

export interface ConsentNoticeSummary {
  id: string;
  version: string;
  effective_from: string;
  retired_at: string | null;
  body_sha256: string;
  purposes: ConsentPurpose[];
}

/** GET /consent/notices — requireAdmin. */
export async function fetchNotices(): Promise<{ data: ConsentNoticeSummary[] }> {
  return apiClient.get<{ data: ConsentNoticeSummary[] }>("/consent/notices");
}

/**
 * POST /consent/notices — requireAdmin.
 *
 * Publishing retires the live notice and re-prompts EVERY rider on their next
 * profile refresh. That is not a side effect to work around; it is the point
 * of versioning the notice.
 */
export async function publishNotice(input: {
  version: string;
  body_en: string;
  body_ta: string;
}): Promise<ConsentNoticeSummary> {
  return apiClient.post<ConsentNoticeSummary>("/consent/notices", input);
}
