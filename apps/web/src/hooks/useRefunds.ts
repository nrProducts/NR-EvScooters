import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/refunds";

export function useRefunds(filters: api.RefundFilters) {
  return useQuery({ queryKey: ["refunds", filters], queryFn: () => api.fetchRefunds(filters) });
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
