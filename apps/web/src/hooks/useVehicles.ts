import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/vehicles";
import type { Vehicle, VehicleStatus } from "@/types";

export function useVehicles(filters: api.VehicleFilters) {
  return useQuery({
    queryKey: ["vehicles", filters],
    queryFn: () => api.fetchVehicles(filters),
  });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api.fetchVehicleById(id!),
    enabled: !!id,
  });
}

export function useUpdateVehicleStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: VehicleStatus }) => api.updateVehicleStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteVehicle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Vehicle>) => api.createVehicle(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}
