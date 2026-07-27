import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/payments";

export function useTransactions(filters: api.PaymentFilters) {
  return useQuery({ queryKey: ["transactions", filters], queryFn: () => api.fetchTransactions(filters) });
}

export function useIssueRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.issueRefund(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["transactions"] }),
  });
}
