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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}
