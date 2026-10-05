import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/refunds";

export function useRefunds(filters: api.RefundFilters) {
  return useQuery({ queryKey: ["refunds", filters], queryFn: () => api.fetchRefunds(filters) });
}

export function useRefundSettlement(id: string | undefined) {
  return useQuery({
    queryKey: ["refund-settlement", id],
    queryFn: () => api.fetchRefundSettlement(id!),
    enabled: !!id,
  });
}

export function useCreateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (depositId: string) => api.createRefund(depositId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
    },
  });
}

export function useRetryRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.retryRefund(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
    },
  });
}

export function useReviewRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ReviewRefundInput }) => api.reviewRefund(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["refund-settlement"] });
    },
  });
}

export function useRejectRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectRefund(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["refunds"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
    },
  });
}
