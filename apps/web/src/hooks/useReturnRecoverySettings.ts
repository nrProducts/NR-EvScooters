import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@/lib/useQuery";
import * as api from "@/services/api/returnRecoverySettings";

export function useReturnRecoverySettings() {
  return useQuery({ queryKey: ["return-recovery-settings"], queryFn: api.fetchReturnRecoverySettings });
}

export function useUpdateReturnRecoverySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.UpdateReturnRecoverySettingsInput) => api.updateReturnRecoverySettings(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["return-recovery-settings"] });
    },
  });
}
