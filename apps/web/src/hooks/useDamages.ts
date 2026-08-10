import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/damages";

export function useDamages(filters: api.DamageFilters) {
  return useQuery({ queryKey: ["damages", filters], queryFn: () => api.fetchDamages(filters) });
}

export function useDamage(id: string | undefined) {
  return useQuery({
    queryKey: ["damage", id],
    queryFn: () => api.fetchDamageById(id!),
    enabled: !!id,
  });
}

export function useResolveDamageDispute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, resolvedAmount }: { id: string; notes: string; resolvedAmount?: number }) =>
      api.resolveDamageDispute(id, notes, resolvedAmount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["damages"] });
      qc.invalidateQueries({ queryKey: ["damage"] });
      qc.invalidateQueries({ queryKey: ["deposits"] });
    },
  });
}

export function useRecordDamage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ rentalId, input }: { rentalId: string; input: Parameters<typeof api.recordDamage>[1] }) =>
      api.recordDamage(rentalId, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["damages"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
