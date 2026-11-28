import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/useQuery";
import * as api from "@/services/api/billingCycle";

export function useBillingCycleSettings(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["billing-cycle-settings"],
    queryFn: api.fetchBillingCycleSettings,
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateBillingCycleSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.UpdateBillingCycleSettingsInput) => api.updateBillingCycleSettings(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing-cycle-settings"] }),
  });
}

export function usePreviewBillingCycleChange() {
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: api.BillingCycleChangeInput }) =>
      api.previewBillingCycleChange(bookingId, input),
  });
}

export function useApplyBillingCycleChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: api.BillingCycleApplyInput }) =>
      api.applyBillingCycleChange(bookingId, input),
    onSuccess: () => {
      // Every grid that shows a due date / plan status / amount owed for this rider.
      qc.invalidateQueries({ queryKey: ["pickup-queue"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user"] });
      qc.invalidateQueries({ queryKey: ["vehicles"] });
    },
  });
}
