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

export function useUploadVehiclePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, isPrimary }: { id: string; file: File; isPrimary?: boolean }) =>
      api.uploadVehiclePhoto(id, file, isPrimary),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle"] }),
  });
}

export function useDeleteVehiclePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, photoId }: { id: string; photoId: string }) => api.deleteVehiclePhoto(id, photoId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["vehicle"] }),
  });
}

export function useScrapVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.ScrapVehicleInput }) => api.scrapVehicle(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle"] });
    },
  });
}

export function useAssignVehicleToUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId, unassignExisting }: { id: string; userId: string; unassignExisting?: boolean }) =>
      api.assignVehicleToUser(id, userId, unassignExisting),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle"] });
    },
  });
}
