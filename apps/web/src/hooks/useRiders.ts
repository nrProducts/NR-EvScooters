import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/riders";

export function useRiders(filters: api.RiderFilters) {
  return useQuery({ queryKey: ["riders", filters], queryFn: () => api.fetchRiders(filters) });
}

export function useRider(id: string | undefined) {
  return useQuery({
    queryKey: ["rider", id],
    queryFn: () => api.fetchRiderById(id!),
    enabled: !!id,
  });
}

export function useChangeRiderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "activate" | "deactivate" | "suspend";
      reason?: string;
    }) => api.changeRiderStatus(id, action, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["riders"] });
      qc.invalidateQueries({ queryKey: ["rider"] });
    },
  });
}

export function useDeleteRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riders"] }),
  });
}

export function useRestoreRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.restoreRider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riders"] }),
  });
}
