import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/billing";

export function useChargeRules(filters: api.ChargeRuleFilters) {
  return useQuery({ queryKey: ["charge-rules", filters], queryFn: () => api.fetchChargeRules(filters) });
}

export function useCreateChargeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateChargeRuleInput) => api.createChargeRule(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["charge-rules"] }),
  });
}

export function useUpdateChargeRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.UpdateChargeRuleInput }) => api.updateChargeRule(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["charge-rules"] }),
  });
}

export function useRiderCharges(filters: api.RiderChargeFilters) {
  return useQuery({ queryKey: ["rider-charges", filters], queryFn: () => api.fetchRiderCharges(filters) });
}

export function useWaiveRiderCharge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { waived_amount: number; reason: string } }) =>
      api.waiveRiderCharge(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rider-charges"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}

export function useDiscountRules(filters: api.DiscountRuleFilters) {
  return useQuery({ queryKey: ["discount-rules", filters], queryFn: () => api.fetchDiscountRules(filters) });
}

export function useCreateDiscountRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: api.CreateDiscountRuleInput) => api.createDiscountRule(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-rules"] }),
  });
}

export function useUpdateDiscountRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: api.UpdateDiscountRuleInput }) => api.updateDiscountRule(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discount-rules"] }),
  });
}

export function useRiderDiscounts(filters: api.RiderDiscountFilters) {
  return useQuery({ queryKey: ["rider-discounts", filters], queryFn: () => api.fetchRiderDiscounts(filters) });
}

export function useCancelRiderDiscount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { reason: string } }) => api.cancelRiderDiscount(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rider-discounts"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
  });
}
