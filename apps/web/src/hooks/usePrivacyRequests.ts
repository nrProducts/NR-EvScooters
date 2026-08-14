import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/privacy";

export function usePrivacyRequests(filters: api.PrivacyRequestFilters) {
  return useQuery({
    queryKey: ["privacy-requests", filters],
    queryFn: () => api.fetchRequests(filters),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["privacy-requests"] });
  // An executed erasure changes the rider's profile too.
  qc.invalidateQueries({ queryKey: ["users"] });
  qc.invalidateQueries({ queryKey: ["user"] });
}

export function useUpdatePrivacyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateRequest>[1] }) =>
      api.updateRequest(id, patch),
    onSuccess: () => invalidate(qc),
  });
}

export function useRejectPrivacyRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.rejectRequest(id, reason),
    onSuccess: () => invalidate(qc),
  });
}

export function useApproveErasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approveErasure(id),
    onSuccess: () => invalidate(qc),
  });
}

export function useExecuteErasure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force, reason }: { id: string; force?: boolean; reason?: string }) =>
      api.executeErasure(id, { force, reason }),
    onSuccess: () => invalidate(qc),
  });
}
