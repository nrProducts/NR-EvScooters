import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { OtherCharge, PaginatedResult, ReturnDetail, ReturnSettlement, ReturnSettlementStatus } from "@/types";

/** GET /returns/:rentalId — requireModule("returns"). Everything the Return Detail page needs in one call. */
export async function fetchReturnDetail(rentalId: string): Promise<ReturnDetail> {
  return apiClient.get<ReturnDetail>(`/returns/${rentalId}`);
}

export interface ApproveReturnSettlementInput {
  damageItems: { amount: number; description: string; photoPaths: string[] }[];
  lateFeeOverride?: number;
  otherCharges: OtherCharge[];
  endBatteryPct?: number;
}

/** POST /returns/:rentalId/approve — the full return-approval + settlement orchestrator. */
export async function approveReturnSettlement(
  rentalId: string, input: ApproveReturnSettlementInput,
): Promise<ReturnSettlement> {
  return apiClient.post<ReturnSettlement>(`/returns/${rentalId}/approve`, input);
}

export interface ListSettlementsFilters {
  status?: ReturnSettlementStatus | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "processed_at";
  sortDir?: "asc" | "desc";
}

/** GET /returns/settlements — requireModule("returns"). Backs the Returns page's "Settled" tab. */
export async function fetchSettlements(filters: ListSettlementsFilters = {}): Promise<PaginatedResult<ReturnSettlement>> {
  const { status, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<ReturnSettlement>>("/returns/settlements", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}
