import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/referrals";

export function useReferralProgram() {
  return useQuery({ queryKey: ["referral-program"], queryFn: api.fetchReferralProgram });
}

export function useUpdateReferralProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.UpdateReferralProgramInput) => api.updateReferralProgram(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["referral-program"] }),
  });
}
