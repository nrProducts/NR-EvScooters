import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AccountStatus, KycStatus, PaginatedResult, Rider, RiderDetail } from "@/types";

export interface RiderFilters {
  search?: string;
  kycStatus?: KycStatus | "all";
  accountStatus?: AccountStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /users — requireStaff. See apps/backend/src/modules/users/users.routes.ts */
export async function fetchRiders(filters: RiderFilters = {}): Promise<PaginatedResult<Rider>> {
  const { search, kycStatus, accountStatus, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<Rider>>("/users", {
    page,
    pageSize,
    search,
    kycStatus: kycStatus && kycStatus !== "all" ? kycStatus : undefined,
    accountStatus: accountStatus && accountStatus !== "all" ? accountStatus : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /users/:id */
export async function fetchRiderById(id: string): Promise<RiderDetail> {
  return apiClient.get<RiderDetail>(`/users/${id}`);
}

/** GET /users/:id/photo/url — signed URL for the rider's profile photo, if one was uploaded. */
export async function fetchRiderPhotoUrl(id: string): Promise<{ url: string; expires_in: number }> {
  return apiClient.get<{ url: string; expires_in: number }>(`/users/${id}/photo/url`);
}

/** PATCH /users/:id/status — requireStaff. Suspending requires a reason (≥5 chars). */
export async function changeRiderStatus(
  id: string,
  action: "activate" | "deactivate" | "suspend",
  reason?: string,
) {
  return apiClient.patch(`/users/${id}/status`, { action, reason });
}

/** DELETE /users/:id — requireAdmin. Soft delete. */
export async function deleteRider(id: string) {
  return apiClient.delete(`/users/${id}`);
}

/** POST /users/:id/restore — requireAdmin. */
export async function restoreRider(id: string) {
  return apiClient.post(`/users/${id}/restore`);
}
