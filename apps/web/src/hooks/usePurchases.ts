import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/purchases";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";

const KEY = ["purchases"] as const;
const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export const usePurchaseCategories = () =>
  useQuery({ queryKey: [...KEY, "categories"], queryFn: api.fetchPurchaseCategories, staleTime: Infinity });

export const useVendors = (search?: string) =>
  useQuery({ queryKey: [...KEY, "vendors", search], queryFn: () => api.fetchVendors(search) });

export const useBills = (f: Parameters<typeof api.fetchBills>[0]) =>
  useQuery({ queryKey: [...KEY, "bills", f], queryFn: () => api.fetchBills(f) });

export const useBill = (id: string | null) =>
  useQuery({ queryKey: [...KEY, "bill", id], queryFn: () => api.fetchBill(id!), enabled: !!id });

export const usePayables = () => useQuery({ queryKey: [...KEY, "payables"], queryFn: api.fetchPayables });
export const useItcSummary = (month: string) =>
  useQuery({ queryKey: [...KEY, "itc", month], queryFn: () => api.fetchItcSummary(month) });
export const useTwoBNotInBooks = (month: string) =>
  useQuery({ queryKey: [...KEY, "2b-missing", month], queryFn: () => api.fetchTwoBNotInBooks(month) });
export const useAssets = (rate: number) =>
  useQuery({ queryKey: [...KEY, "assets", rate], queryFn: () => api.fetchAssets(rate) });
export const usePaymentCandidates = (id: string | null) =>
  useQuery({ queryKey: [...KEY, "candidates", id], queryFn: () => api.paymentCandidates(id!), enabled: !!id });

/**
 * One mutation hook for every write on this page: invalidate the whole
 * purchases cache, toast on success, and leave errors to the caller when it
 * shows them inline (a form), or toast them otherwise.
 */
export function usePurchaseMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  success: (result: TResult) => { title: string; message: string },
  opts: { inlineErrors?: boolean } = {},
) {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      push({ tone: "success", ...success(r) });
    },
    onError: opts.inlineErrors ? undefined : (e) => push({ tone: "error", title: "That didn't work", message: errorMessage(e) }),
  });
}
