import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { KycDetail, KycQueueItem, KycStatus, PaginatedResult } from "@/types";

export interface KycFilters {
  status?: KycStatus | "all";
  search?: string;
  page?: number;
  pageSize?: number;
}

/** GET /kyc — requireStaff. See apps/backend/src/modules/kyc/kyc.routes.ts */
export async function fetchKycQueue(filters: KycFilters = {}): Promise<PaginatedResult<KycQueueItem>> {
  const { status, search, page = 1, pageSize = 9 } = filters;
  const res = await apiClient.get<BackendPaginated<KycQueueItem>>("/kyc", {
    page,
    pageSize,
    search,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /kyc/:userId */
export async function fetchKycDetail(userId: string): Promise<KycDetail> {
  return apiClient.get<KycDetail>(`/kyc/${userId}`);
}

/** GET /kyc/documents/:documentId/url?side=front|back — signed URL, previewed in-page. */
export async function fetchDocumentUrl(documentId: string, side: "front" | "back" = "front") {
  return apiClient.get<{ url: string }>(`/kyc/documents/${documentId}/url`, { side });
}

/** POST /kyc/documents/:documentId/verify */
export async function verifyDocument(documentId: string) {
  return apiClient.post(`/kyc/documents/${documentId}/verify`);
}

/** POST /kyc/documents/:documentId/reject */
export async function rejectDocument(documentId: string, reason: string) {
  return apiClient.post(`/kyc/documents/${documentId}/reject`, { reason });
}

/** POST /kyc/:userId/approve — approves the rider's overall KYC. */
export async function approveKyc(userId: string) {
  return apiClient.post(`/kyc/${userId}/approve`);
}

/** POST /kyc/:userId/reject */
export async function rejectKyc(userId: string, reason: string) {
  return apiClient.post(`/kyc/${userId}/reject`, { reason });
}
