import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/maintenance";
import type { MaintenanceStatus, MaintenanceTicket } from "@/types";

export function useMaintenanceTickets(filters: api.MaintenanceFilters) {
  return useQuery({ queryKey: ["maintenance", filters], queryFn: () => api.fetchMaintenanceTickets(filters) });
}

export function useUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: MaintenanceStatus }) => api.updateTicketStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useAssignTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, technician }: { id: string; technician: string }) => api.assignTechnician(id, technician),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<MaintenanceTicket>) => api.createTicket(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}
