import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  AccountStatus, AppUser, AppUserDetail, BackendRoleName, KycStatus, ModuleKey, PaginatedResult,
} from "@/types";

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

/** GET /users/:id/roles */
export async function fetchUserRoles(id: string): Promise<BackendRoleName[]> {
  const res = await apiClient.get<{ roles: BackendRoleName[] }>(`/users/${id}/roles`);
  return res.roles;
}

/**
 * PUT /users/:id/roles — requireAdmin. Full-replace. Blocked entirely for
 * self-edit and for removing the last admin (backend-enforced, surfaced via
 * the thrown ApiError's message).
 */
export async function replaceUserRoles(id: string, roles: BackendRoleName[]): Promise<BackendRoleName[]> {
  const res = await apiClient.put<{ roles: BackendRoleName[] }>(`/users/${id}/roles`, { roles });
  return res.roles;
}

/** GET /users/:id/permissions — requireAdmin. */
export async function fetchUserPermissions(id: string): Promise<ModuleKey[]> {
  const res = await apiClient.get<{ modules: ModuleKey[] }>(`/users/${id}/permissions`);
  return res.modules;
}

/**
 * PUT /users/:id/permissions — requireAdmin. Full-replace; only meaningful
 * for an account currently holding the "staff" role (backend rejects
 * otherwise).
 */
export async function replaceUserPermissions(id: string, modules: ModuleKey[]): Promise<ModuleKey[]> {
  const res = await apiClient.put<{ modules: ModuleKey[] }>(`/users/${id}/permissions`, { modules });
  return res.modules;
}
