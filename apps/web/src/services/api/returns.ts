import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  DamageCategory, OtherCharge, PaginatedResult, PaymentReviewView, ReturnDetail, ReturnSettlement,
  ReturnSettlementStatus,
} from "@/types";

/** GET /returns/:rentalId — requireAction("returns","view"). Everything the Return Detail page needs in one call. */
export async function fetchReturnDetail(rentalId: string): Promise<ReturnDetail> {
  return apiClient.get<ReturnDetail>(`/returns/${rentalId}`);
}

export interface SaveInspectionInput {
  otherCharges: OtherCharge[];
  /** Required when no damage charge has ever been added for this return. */
  confirmNoDamage?: boolean;
}

/**
 * POST /returns/:rentalId/inspect — Admin Inspection. Stages other charges
 * and — only if they leave an additional amount due — raises the payable
 * invoice and notifies the rider. Damage itself is added separately, one
 * charge at a time (see addDamageCharge), before this is called. This is
 * what the "Save Inspection" / "Request Payment from Rider" button calls;
 * which label it shows is a live client-side preview of the same math, not a
 * different endpoint.
 */
export async function saveInspection(rentalId: string, input: SaveInspectionInput): Promise<ReturnDetail> {
  return apiClient.post<ReturnDetail>(`/returns/${rentalId}/inspect`, input);
}

export interface AddDamageChargeInput {
  amount: number;
  description: string;
  damageCategory: DamageCategory;
  photos: File[];
}

/**
 * POST /returns/:rentalId/damage — adds one damage charge immediately, with
 * its photos, so it appears as its own card right away rather than waiting
 * on the final inspection submit.
 */
export async function addDamageCharge(rentalId: string, input: AddDamageChargeInput): Promise<ReturnDetail> {
  const form = new FormData();
  form.set("amount", String(input.amount));
  form.set("description", input.description);
  form.set("damage_category", input.damageCategory);
  for (const photo of input.photos) form.append("photos", photo);
  return apiClient.postForm<ReturnDetail>(`/returns/${rentalId}/damage`, form);
}

/** POST /returns/:rentalId/damage/:damageId/remove — Remove-only; waives a mistakenly-added damage charge. */
export async function removeDamageCharge(rentalId: string, damageId: string): Promise<ReturnDetail> {
  return apiClient.post<ReturnDetail>(`/returns/${rentalId}/damage/${damageId}/remove`, {});
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
