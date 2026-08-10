import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { Deposit, DepositStatus, PaginatedResult } from "@/types";

export interface DepositFilters {
  status?: DepositStatus | "all";
  refundEligible?: boolean;
  page?: number;
  pageSize?: number;
}

/** GET /deposits — requireStaff. See apps/backend/src/modules/deposits/deposits.routes.ts */
export async function fetchDeposits(filters: DepositFilters = {}): Promise<PaginatedResult<Deposit>> {
  const { status, refundEligible, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<Deposit>>("/deposits", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    refundEligible,
  });
  return toPaginatedResult(res);
}

export async function fetchDepositForBooking(bookingId: string): Promise<Deposit> {
  return apiClient.get<Deposit>(`/deposits/booking/${bookingId}`);
}
