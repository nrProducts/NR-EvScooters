import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/support";

export function useSupportQueue(filters: api.SupportFilters, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["support-queue", filters],
    queryFn: () => api.fetchSupportQueue(filters),
    enabled: options?.enabled ?? true,
  });
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
    mutationFn: ({ id, input }: { id: string; input: api.UpdateSupportTicketInput }) =>
      api.updateSupportTicket(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-queue"] });
      qc.invalidateQueries({ queryKey: ["support-ticket"] });
    },
  });
}

/** Fetched on demand (see RiderImpactModal) rather than for every row in the queue. */
export function useRiderImpactPreview(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["support-rider-impact-preview", id],
    queryFn: () => api.fetchRiderImpactPreview(id!),
    enabled: !!id && (options?.enabled ?? true),
  });
}
