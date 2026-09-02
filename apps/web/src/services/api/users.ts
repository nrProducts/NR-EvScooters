import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  AccountStatus, AppUser, AppUserDetail, BackendRoleName, KycStatus, ModulePermission,
  PaginatedResult, PermissionProfileName,
} from "@/types";

export interface UserFilters {
  search?: string;
  kycStatus?: KycStatus | "all";
  accountStatus?: AccountStatus | "all";
  role?: BackendRoleName | "all";
  /** Any staff-side role at once. Ignored when `role` is set. */
  staffOnly?: boolean;
  /** Drop riders who already have an active booking or rental (the create-booking picker). */
  bookable?: boolean;
  /** Only self-registered accounts awaiting an admin's approve/reject. Overrides `role`. */
  pendingApproval?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: "full_name" | "created_at" | "kyc_status";
  sortDir?: "asc" | "desc";
}

/** GET /users — requireStaff. See apps/backend/src/modules/users/users.routes.ts */
export async function fetchUsers(filters: UserFilters = {}): Promise<PaginatedResult<AppUser>> {
  const { search, kycStatus, accountStatus, role, staffOnly, bookable, pendingApproval, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<AppUser>>("/users", {
    page,
    pageSize,
    search,
    kycStatus: kycStatus && kycStatus !== "all" ? kycStatus : undefined,
    accountStatus: accountStatus && accountStatus !== "all" ? accountStatus : undefined,
    role: role && role !== "all" && !pendingApproval ? role : undefined,
    staffOnly: staffOnly ? "true" : undefined,
    bookable: bookable ? "true" : undefined,
    pendingApproval: pendingApproval ? "true" : undefined,
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

/*
 * The /users/:id/capabilities pair is gone.
 *
 * Capabilities are ordinary permissions now — kyc.reveal_number,
 * privacy.process, privacy.export — so they are read and written through the
 * permissions endpoints below like everything else. There is no separate
 * endpoint and no separate screen.
 */

/** GET /users/:id/roles — one role now; `roles` is kept as a one-element echo. */
export async function fetchUserRole(id: string): Promise<BackendRoleName> {
  const res = await apiClient.get<{ role: BackendRoleName }>(`/users/${id}/roles`);
  return res.role;
}

/**
 * PUT /users/:id/roles — requireAdmin.
 *
 * `users.role` is a single column, so this sets a role rather than replacing
 * a set. Blocked for self-edit and for removing the last admin
 * (backend-enforced, surfaced via the thrown ApiError's message).
 */
export async function changeUserRole(id: string, role: BackendRoleName): Promise<BackendRoleName> {
  const res = await apiClient.put<{ role: BackendRoleName }>(`/users/${id}/roles`, { role });
  return res.role;
}

/**
 * POST /users/:id/approve — requireAdmin. Approves a self-registered pending
 * account and assigns its role (staff or rider) + activates it, in one
 * server-side transaction-safe step. See users.service.ts approveSignup().
 */
export async function approveSignup(id: string, role: "staff" | "rider"): Promise<AppUserDetail> {
  return apiClient.post<AppUserDetail>(`/users/${id}/approve`, { role });
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
 * preset server-side and applies it wholesale. The source of truth for what a
 * profile grants is the `permission_profiles` table, which both this client
 * and the backend read — neither holds a copy.
 */
export async function applyUserPermissionProfile(
  id: string,
  profile: PermissionProfileName,
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
