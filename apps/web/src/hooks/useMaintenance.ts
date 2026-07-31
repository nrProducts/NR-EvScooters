import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/maintenance";
import type { MaintenanceStatus } from "@/types";

export function useMaintenanceTickets(filters: api.MaintenanceFilters) {
  return useQuery({ queryKey: ["maintenance", filters], queryFn: () => api.fetchMaintenanceTickets(filters) });
}

export function useCreateMaintenanceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateMaintenanceInput) => api.createMaintenanceTicket(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useUpdateMaintenanceTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, description }: { id: string; status?: MaintenanceStatus; description?: string }) =>
      api.updateMaintenanceTicket(id, { status, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["maintenance"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["vehicle"] });
    },
  });
}

function invalidateMaintenanceAndVehicles(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["maintenance"] });
  qc.invalidateQueries({ queryKey: ["vehicles"] });
  qc.invalidateQueries({ queryKey: ["vehicle"] });
}

export function useTriageQuickFix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedReadyAt }: { id: string; expectedReadyAt: string }) =>
      api.triageQuickFix(id, expectedReadyAt),
    onSuccess: () => invalidateMaintenanceAndVehicles(qc),
  });
}

export function useAssignTempVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tempVehicleId }: { id: string; tempVehicleId: string }) =>
      api.assignTempVehicle(id, tempVehicleId),
    onSuccess: () => invalidateMaintenanceAndVehicles(qc),
  });
}

export function useResolveNotRepairable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: api.NotRepairableInput }) =>
      api.resolveNotRepairable(id, input),
    onSuccess: () => invalidateMaintenanceAndVehicles(qc),
  });
}

export function useReassignAfterScrap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, replacementVehicleId }: { id: string; replacementVehicleId: string }) =>
      api.reassignAfterScrap(id, replacementVehicleId),
    onSuccess: () => invalidateMaintenanceAndVehicles(qc),
  });
}
