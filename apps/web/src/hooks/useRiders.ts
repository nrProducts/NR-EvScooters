import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/riders";
import type { KycStatus } from "@/types";

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

export function useSetRiderKyc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: KycStatus }) => api.setRiderKycStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["riders"] });
      qc.invalidateQueries({ queryKey: ["kyc-queue"] });
    },
  });
}

export function useSuspendRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.suspendRider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riders"] }),
  });
}

export function useDeleteRider() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteRider(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["riders"] }),
  });
}
