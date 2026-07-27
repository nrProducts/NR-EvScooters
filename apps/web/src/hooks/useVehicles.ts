import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/vehicles";

export function useVehicles(filters: api.VehicleFilters) {
  return useQuery({ queryKey: ["vehicles", filters], queryFn: () => api.fetchVehicles(filters) });
}

export function useVehicle(id: string | undefined) {
  return useQuery({
    queryKey: ["vehicle", id],
    queryFn: () => api.fetchVehicleById(id!),
    enabled: !!id,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.VehicleFormInput) => api.createVehicle(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicles"] }),
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.VehicleFormInput> }) =>
      api.updateVehicle(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle"] });
    },
  });
}
