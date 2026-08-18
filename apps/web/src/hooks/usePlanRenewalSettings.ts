import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/planRenewalSettings";

export function usePlanRenewalSettings() {
  return useQuery({ queryKey: ["plan-renewal-settings"], queryFn: api.fetchPlanRenewalSettings });
}

export function useUpdatePlanRenewalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.UpdatePlanRenewalSettingsInput) => api.updatePlanRenewalSettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-renewal-settings"] });
    },
  });
}
