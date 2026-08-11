import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { Damage, DamageStatus, PaginatedResult } from "@/types";

export interface DamageFilters {
  bookingId?: string;
  status?: DamageStatus | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "amount";
  sortDir?: "asc" | "desc";
}

/** GET /damages — requireStaff. See apps/backend/src/modules/damages/damages.routes.ts */
export async function fetchDamages(filters: DamageFilters = {}): Promise<PaginatedResult<Damage>> {
  const { bookingId, status, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<Damage>>("/damages", {
    page,
    pageSize,
    bookingId,
    status: status && status !== "all" ? status : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

export async function fetchDamageById(id: string): Promise<Damage> {
  return apiClient.get<Damage>(`/damages/${id}`);
}

/** POST /damages/:id/resolve — requireStaff. Admin may uphold or adjust the amount while resolving a dispute. */
export async function resolveDamageDispute(id: string, notes: string, resolvedAmount?: number): Promise<Damage> {
  return apiClient.post<Damage>(`/damages/${id}/resolve`, { notes, resolved_amount: resolvedAmount });
}

/**
 * POST /rentals/:rentalId/return-inspection — requireStaff, multipart. The
 * staff return-inspection entry point; the rider's rental screen never calls
 * this, only the admin ride-completion flow does.
 */
export async function recordDamage(
  rentalId: string,
  input: { amount: number; description: string; photos?: File[] },
): Promise<Damage> {
  const form = new FormData();
  form.set("amount", String(input.amount));
  form.set("description", input.description);
  for (const photo of input.photos ?? []) form.append("photos", photo);
  return apiClient.postForm<Damage>(`/rentals/${rentalId}/return-inspection`, form);
}
