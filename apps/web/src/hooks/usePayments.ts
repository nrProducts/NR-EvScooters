import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/payments";

export function useInvoices(filters: api.InvoiceFilters) {
  return useQuery({ queryKey: ["invoices", filters], queryFn: () => api.fetchInvoices(filters) });
}

export function useInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.fetchInvoiceById(id!),
    enabled: !!id,
  });
}

export function useRefundInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => api.refundInvoice(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["invoice"] });
    },
  });
}
