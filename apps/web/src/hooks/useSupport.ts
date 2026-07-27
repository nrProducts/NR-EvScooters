import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/support";
import type { SupportPriority, SupportStatus } from "@/types";

export function useSupportQueue(filters: api.SupportFilters) {
  return useQuery({ queryKey: ["support-queue", filters], queryFn: () => api.fetchSupportQueue(filters) });
}

export function useSupportTicket(id: string | undefined) {
  return useQuery({
    queryKey: ["support-ticket", id],
    queryFn: () => api.fetchSupportTicket(id!),
    enabled: !!id,
  });
}

export function useUpdateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: { status?: SupportStatus; priority?: SupportPriority; assigned_to?: string };
    }) => api.updateSupportTicket(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-queue"] });
      qc.invalidateQueries({ queryKey: ["support-ticket"] });
    },
  });
}
