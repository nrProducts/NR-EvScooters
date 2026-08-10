import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/plans";

export function usePlans(filters: api.PlanFilters) {
  return useQuery({ queryKey: ["plans", filters], queryFn: () => api.fetchPlans(filters) });
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: ["plan", id],
    queryFn: () => api.fetchPlanById(id!),
    enabled: !!id,
  });
}

export function useCreatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.PlanInput) => api.createPlan(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plans"] }),
  });
}

export function useUpdatePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<api.PlanInput> }) => api.updatePlan(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plans"] });
      qc.invalidateQueries({ queryKey: ["plan"] });
    },
  });
}
