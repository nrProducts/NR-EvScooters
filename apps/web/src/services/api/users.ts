import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AccountStatus, AppUser, AppUserDetail, BackendRoleName, Capability, KycStatus, PaginatedResult } from "@/types";

export interface UserFilters {
  search?: string;
  kycStatus?: KycStatus | "all";
  accountStatus?: AccountStatus | "all";
  role?: BackendRoleName | "all";
  /** Any staff-side role at once. Ignored when `role` is set. */
  staffOnly?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "full_name" | "created_at" | "kyc_status";
  sortDir?: "asc" | "desc";
}

/** GET /users — requireStaff. See apps/backend/src/modules/users/users.routes.ts */
export async function fetchUsers(filters: UserFilters = {}): Promise<PaginatedResult<AppUser>> {
  const { search, kycStatus, accountStatus, role, staffOnly, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<AppUser>>("/users", {
    page,
    pageSize,
    search,
    kycStatus: kycStatus && kycStatus !== "all" ? kycStatus : undefined,
    accountStatus: accountStatus && accountStatus !== "all" ? accountStatus : undefined,
    role: role && role !== "all" ? role : undefined,
    staffOnly: staffOnly ? "true" : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** GET /users/:id */
export async function fetchUserById(id: string): Promise<AppUserDetail> {
  return apiClient.get<AppUserDetail>(`/users/${id}`);
}

/** GET /users/:id/photo/url — signed URL for the user's profile photo, if one was uploaded. */
export async function fetchUserPhotoUrl(id: string): Promise<{ url: string; expires_in: number }> {
  return apiClient.get<{ url: string; expires_in: number }>(`/users/${id}/photo/url`);
}

/** PATCH /users/:id/status — requireStaff. Suspending requires a reason (≥5 chars). */
export async function changeUserStatus(
  id: string,
  action: "activate" | "deactivate" | "suspend",
  reason?: string,
) {
  return apiClient.patch(`/users/${id}/status`, { action, reason });
}

/** DELETE /users/:id — requireAdmin. Soft delete. */
export async function deleteUser(id: string) {
  return apiClient.delete(`/users/${id}`);
}

/** POST /users/:id/restore — requireAdmin. */
export async function restoreUser(id: string) {
  return apiClient.post(`/users/${id}/restore`);
}

/**
 * GET /users/:id/capabilities
 *
 * Capabilities gate access to raw rider personal data (Aadhaar/DL images, the
 * rights queue, data exports). Separate from roles on purpose — see
 * types/index.ts and supabase/migrations/20260814100100_*.sql.
 */
export async function fetchUserCapabilities(id: string): Promise<{ capabilities: Capability[] }> {
  return apiClient.get<{ capabilities: Capability[] }>(`/users/${id}/capabilities`);
}

/**
 * PUT /users/:id/capabilities — requireAdmin. Replaces the set wholesale, so
 * an empty array revokes everything. The backend refuses self-modification:
 * an admin who can grant themselves kyc_reviewer has not been restricted.
 */
export async function replaceUserCapabilities(
  id: string,
  capabilities: Capability[],
): Promise<{ capabilities: Capability[] }> {
  return apiClient.put<{ capabilities: Capability[] }>(`/users/${id}/capabilities`, { capabilities });
}
