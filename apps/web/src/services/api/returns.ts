import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  OtherCharge, PaginatedResult, PaymentReviewView, ReturnDetail, ReturnSettlement, ReturnSettlementStatus,
} from "@/types";

/** GET /returns/:rentalId — requireAction("returns","view"). Everything the Return Detail page needs in one call. */
export async function fetchReturnDetail(rentalId: string): Promise<ReturnDetail> {
  return apiClient.get<ReturnDetail>(`/returns/${rentalId}`);
}

export interface SaveInspectionInput {
  damageItems: { amount: number; description: string; photoPaths: string[] }[];
  otherCharges: OtherCharge[];
}

/**
 * POST /returns/:rentalId/inspect — Admin Inspection. Records damage, stages
 * the late fee/other charges, and — only if they leave an additional amount
 * due — raises the payable invoice and notifies the rider. This is what the
 * "Save Inspection" / "Request Payment from Rider" button calls; which
 * label it shows is a live client-side preview of the same math, not a
 * different endpoint.
 */
export async function saveInspection(rentalId: string, input: SaveInspectionInput): Promise<ReturnDetail> {
  return apiClient.post<ReturnDetail>(`/returns/${rentalId}/inspect`, input);
}

/** GET /returns/:rentalId/payment — "Review Payment": amount, reference, date, status. */
export async function fetchPaymentReview(rentalId: string): Promise<PaymentReviewView> {
  return apiClient.get<PaymentReviewView>(`/returns/${rentalId}/payment`);
}

/** POST /returns/:rentalId/verify-payment — the explicit admin confirmation that unlocks Approve Return. */
export async function verifyReturnPayment(rentalId: string): Promise<ReturnDetail> {
  return apiClient.post<ReturnDetail>(`/returns/${rentalId}/verify-payment`, {});
}

export interface ApproveReturnSettlementInput {
  endBatteryPct?: number;
}

/**
 * POST /returns/:rentalId/approve — completes the return. The backend
 * rejects this outright (not just a disabled button) whenever an additional
 * amount is due and not yet payment-verified — see rentals.service.ts's
 * settleReturn.
 */
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

/** GET /returns/settlements — requireAction("returns","view"). Backs the Returns page's "Settled" tab. */
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
