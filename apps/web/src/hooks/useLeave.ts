import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/leave";

export function useLeaveTypes() {
  return useQuery({ queryKey: ["leave", "types"], queryFn: api.fetchLeaveTypes });
}

export function useMyLeaveBalance() {
  return useQuery({ queryKey: ["leave", "balance"], queryFn: api.fetchMyLeaveBalance });
}

export function useMyLeaveRequests(filters: api.LeaveFilters) {
  return useQuery({ queryKey: ["leave", "me", filters], queryFn: () => api.fetchMyLeaveRequests(filters) });
}

export function useLeaveRequests(filters: api.LeaveLogFilters) {
  return useQuery({ queryKey: ["leave", "log", filters], queryFn: () => api.fetchLeaveRequests(filters) });
}

/** Enabled only once both dates are picked — this is the pre-submit preview, not a background fetch. */
export function useLeavePreview(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["leave", "preview", startDate, endDate],
    queryFn: () => api.previewLeave(startDate, endDate),
    enabled: !!startDate && !!endDate && endDate >= startDate,
  });
}

function invalidateLeave(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["leave"] });
}

export function useApplyForLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.ApplyLeaveInput) => api.applyForLeave(input),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useCancelMyLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelMyLeaveRequest(id),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote?: string }) => api.approveLeaveRequest(id, reviewNote),
    onSuccess: () => invalidateLeave(qc),
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reviewNote }: { id: string; reviewNote: string }) => api.rejectLeaveRequest(id, reviewNote),
    onSuccess: () => invalidateLeave(qc),
  });
}
