import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/returns";

export function useReturnDetail(rentalId: string | undefined) {
  return useQuery({
    queryKey: ["return-detail", rentalId],
    queryFn: () => api.fetchReturnDetail(rentalId!),
    enabled: !!rentalId,
  });
}

export function useApproveReturnSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rentalId, input }: { rentalId: string; input: api.ApproveReturnSettlementInput }) =>
      api.approveReturnSettlement(rentalId, input),
    onSuccess: (_data, { rentalId }) => {
      qc.invalidateQueries({ queryKey: ["return-detail", rentalId] });
      qc.invalidateQueries({ queryKey: ["pickup-queue"] });
      qc.invalidateQueries({ queryKey: ["settlements"] });
      qc.invalidateQueries({ queryKey: ["refunds"] });
    },
  });
}

export function useSettlements(filters: api.ListSettlementsFilters) {
  return useQuery({ queryKey: ["settlements", filters], queryFn: () => api.fetchSettlements(filters) });
}
