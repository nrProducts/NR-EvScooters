import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/reconciliation";
import { fetchReconciliation } from "@/services/api/reconciliation";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";

const KEY = ["reconciliation"] as const;
const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export function useReconciliation(from: string, to: string) {
  return useQuery({
    queryKey: [...KEY, "live", from, to],
    queryFn: () => fetchReconciliation(from, to),
  });
}

export function useStatements(f: Parameters<typeof api.fetchStatements>[0]) {
  return useQuery({ queryKey: [...KEY, "statements", f], queryFn: () => api.fetchStatements(f) });
}

export function useStatement(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "statement", id],
    queryFn: () => api.fetchStatement(id!),
    enabled: !!id,
  });
}

export function useSettlementSummary(month: string) {
  return useQuery({ queryKey: [...KEY, "summary", month], queryFn: () => api.fetchSettlementSummary(month) });
}

export function useExceptions(status: "open" | "resolved", code?: string) {
  return useQuery({ queryKey: [...KEY, "exceptions", status, code], queryFn: () => api.fetchExceptions(status, code) });
}

export function useBankLines(f: Parameters<typeof api.fetchBankLines>[0]) {
  return useQuery({ queryKey: [...KEY, "bank-lines", f], queryFn: () => api.fetchBankLines(f) });
}

export function useCashBook(month: string) {
  return useQuery({ queryKey: [...KEY, "cash-book", month], queryFn: () => api.fetchCashBook(month) });
}

export function useTieOut(month: string) {
  return useQuery({ queryKey: [...KEY, "tie-out", month], queryFn: () => api.fetchTieOut(month) });
}

export function useSyncSettlements() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => api.syncSettlements(from, to),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      push({
        tone: "success",
        title: "Razorpay synced",
        message: `${r.settlements} settlement${r.settlements === 1 ? "" : "s"} read, ${r.linesAdded} new line${r.linesAdded === 1 ? "" : "s"}.`,
      });
    },
    onError: (error) => push({ tone: "error", title: "Sync failed", message: errorMessage(error) }),
  });
}

export function useResolveException() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "resolve" | "ignore"; note: string }) =>
      api.resolveException(id, action, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      push({ tone: "success", title: "Exception resolved", message: "Recorded with your note in the audit log." });
    },
  });
}

export function useRecoverPayment() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (id: string) => api.recoverExceptionPayment(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["gst"] });
      push({
        tone: r.status === "paid" ? "success" : "warning",
        title: r.status === "paid" ? "Payment recovered" : "Not captured at Razorpay",
        message: r.status === "paid"
          ? "Applied to the rider's bill and its tax invoice issued."
          : "Razorpay does not show this order as captured, so nothing was applied.",
      });
    },
    onError: (error) => push({ tone: "error", title: "Could not recover the payment", message: errorMessage(error) }),
  });
}

export function useCategoriseBankLine() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ id, category, applyToCounterparty }: { id: string; category: string; applyToCounterparty: boolean }) =>
      api.categoriseBankLine(id, category, applyToCounterparty),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      push({ tone: "success", title: "Category saved", message: r.updated > 1 ? `Applied to ${r.updated} lines.` : "Applied to this line." });
    },
    onError: (error) => push({ tone: "error", title: "Could not save the category", message: errorMessage(error) }),
  });
}

export function useImportBankStatement() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: ({ file, confirmNewAccount }: { file: File; confirmNewAccount: boolean }) =>
      api.importBankStatement(file, confirmNewAccount),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: KEY });
      push({
        tone: "success",
        title: "Statement imported",
        message: `${r.matched} line${r.matched === 1 ? "" : "s"} matched${r.exceptions ? `, ${r.exceptions} need a look` : ""}.`,
      });
    },
  });
}
