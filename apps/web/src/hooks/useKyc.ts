import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/kyc";
import type { KycStatus } from "@/types";

export function useKycQueue(status: KycStatus | "all") {
  return useQuery({ queryKey: ["kyc-queue", status], queryFn: () => api.fetchKycQueue(status) });
}

export function useApproveKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveKyc(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc-queue"] });
      qc.invalidateQueries({ queryKey: ["riders"] });
    },
  });
}

export function useRejectKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectKyc(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc-queue"] });
      qc.invalidateQueries({ queryKey: ["riders"] });
    },
  });
}
