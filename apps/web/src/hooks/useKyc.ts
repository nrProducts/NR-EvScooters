import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/kyc";

export function useKycQueue(filters: api.KycFilters) {
  return useQuery({ queryKey: ["kyc-queue", filters], queryFn: () => api.fetchKycQueue(filters) });
}

export function useKycDetail(userId: string | undefined) {
  return useQuery({
    queryKey: ["kyc-detail", userId],
    queryFn: () => api.fetchKycDetail(userId!),
    enabled: !!userId,
  });
}

function invalidateKyc(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["kyc-queue"] });
  qc.invalidateQueries({ queryKey: ["kyc-detail"] });
  qc.invalidateQueries({ queryKey: ["riders"] });
  qc.invalidateQueries({ queryKey: ["rider"] });
}

export function useApproveKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.approveKyc(userId),
    onSuccess: () => invalidateKyc(qc),
  });
}

export function useRejectKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) => api.rejectKyc(userId, reason),
    onSuccess: () => invalidateKyc(qc),
  });
}

export function useVerifyDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (documentId: string) => api.verifyDocument(documentId),
    onSuccess: () => invalidateKyc(qc),
  });
}

export function useRejectDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ documentId, reason }: { documentId: string; reason: string }) =>
      api.rejectDocument(documentId, reason),
    onSuccess: () => invalidateKyc(qc),
  });
}

export function useOpenDocument() {
  return useMutation({
    mutationFn: ({ documentId, side }: { documentId: string; side: "front" | "back" }) =>
      api.fetchDocumentUrl(documentId, side),
    onSuccess: (data) => {
      window.open(data.url, "_blank", "noopener,noreferrer");
    },
  });
}
