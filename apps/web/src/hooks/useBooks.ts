import { useQuery } from "@tanstack/react-query";
import * as api from "@/services/api/books";

const KEY = ["books"] as const;

export const useTrialBalance = (from: string, to: string) =>
  useQuery({ queryKey: [...KEY, "trial-balance", from, to], queryFn: () => api.fetchTrialBalance(from, to) });
export const useProfitAndLoss = (from: string, to: string) =>
  useQuery({ queryKey: [...KEY, "pl", from, to], queryFn: () => api.fetchProfitAndLoss(from, to) });
export const useDepositRegister = () => useQuery({ queryKey: [...KEY, "deposits"], queryFn: api.fetchDepositRegister });
export const useReceivables = () => useQuery({ queryKey: [...KEY, "receivables"], queryFn: api.fetchReceivables });
export const useAdvanceTax = () => useQuery({ queryKey: [...KEY, "advance-tax"], queryFn: api.fetchAdvanceTax });
export const useUnbalancedVouchers = () => useQuery({ queryKey: [...KEY, "unbalanced"], queryFn: api.fetchUnbalanced });
