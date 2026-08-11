import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AccountStatus, AppUser, AppUserDetail, BackendRoleName, KycStatus, PaginatedResult } from "@/types";

export interface UserFilters {
  search?: string;
  kycStatus?: KycStatus | "all";
  accountStatus?: AccountStatus | "all";
  /** Only "admin" and "rider" have any real accounts today — see types/index.ts. */
  role?: BackendRoleName | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "full_name" | "created_at" | "kyc_status";
  sortDir?: "asc" | "desc";
}

/** GET /users — requireStaff. See apps/backend/src/modules/users/users.routes.ts */
export async function fetchUsers(filters: UserFilters = {}): Promise<PaginatedResult<AppUser>> {
  const { search, kycStatus, accountStatus, role, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<AppUser>>("/users", {
    page,
    pageSize,
    search,
    kycStatus: kycStatus && kycStatus !== "all" ? kycStatus : undefined,
    accountStatus: accountStatus && accountStatus !== "all" ? accountStatus : undefined,
    role: role && role !== "all" ? role : undefined,
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
