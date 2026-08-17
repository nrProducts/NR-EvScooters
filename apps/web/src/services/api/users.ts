import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  AccountStatus, AppUser, AppUserDetail, BackendRoleName, Capability, KycStatus, ModulePermission,
  PaginatedResult,
} from "@/types";
import type { PermissionProfileName } from "@/config/permissionProfiles";

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

/** GET /users/:id/permissions — requireAdmin. Module+action grants, not just module presence. */
export async function fetchUserPermissions(id: string): Promise<ModulePermission[]> {
  const res = await apiClient.get<{ modules: ModulePermission[] }>(`/users/${id}/permissions`);
  return res.modules;
}

/**
 * PUT /users/:id/permissions — requireAdmin. Full-replace; only meaningful
 * for an account currently holding the "staff" role (backend rejects
 * otherwise).
 */
export async function replaceUserPermissions(id: string, modules: ModulePermission[]): Promise<ModulePermission[]> {
  const res = await apiClient.put<{ modules: ModulePermission[] }>(`/users/${id}/permissions`, { modules });
  return res.modules;
}

/**
 * POST /users/:id/permissions/apply-profile — requireAdmin. Resolves a named
 * preset (Viewer, Operations Staff, ...) server-side and applies it wholesale
 * — the source of truth for what a profile grants lives in
 * apps/backend/src/config/permissionProfiles.ts, not in this client.
 */
export async function applyUserPermissionProfile(
  id: string,
  profile: Exclude<PermissionProfileName, "custom">,
): Promise<ModulePermission[]> {
  const res = await apiClient.post<{ modules: ModulePermission[] }>(
    `/users/${id}/permissions/apply-profile`,
    { profile },
  );
  return res.modules;
}

export interface CreateStaffInput {
  full_name: string;
  email: string;
  phone: string;
  staff_code?: string;
  role: Extract<BackendRoleName, "staff" | "admin">;
  account_status: AccountStatus;
  permission_profile?: Exclude<PermissionProfileName, "custom">;
}

/**
 * POST /users — requireAdmin. Creates the account with a server-generated
 * temporary password (returned once as `temporary_password` — never sent
 * again by any other endpoint) and, if a permission profile was chosen,
 * applies it in the same server-side call. See users.service.ts createUser().
 */
export async function createStaffUser(input: CreateStaffInput): Promise<AppUser & { temporary_password?: string }> {
  return apiClient.post<AppUser & { temporary_password?: string }>("/users", input);
}
