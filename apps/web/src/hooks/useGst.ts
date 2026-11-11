import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/services/api/gst";
import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";

const GST_KEY = ["gst"] as const;

const errorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export function useTaxDocuments(filters: api.TaxDocumentFilters) {
  return useQuery({ queryKey: [...GST_KEY, "documents", filters], queryFn: () => api.fetchTaxDocuments(filters) });
}

export function useTaxDocumentSummary(from: string, to: string) {
  return useQuery({
    queryKey: [...GST_KEY, "summary", from, to],
    queryFn: () => api.fetchTaxDocumentSummary(from, to),
  });
}

export function usePendingTaxDocuments() {
  return useQuery({ queryKey: [...GST_KEY, "pending"], queryFn: api.fetchPendingTaxDocuments });
}

export function useIssuePendingTaxDocuments() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: api.issuePendingTaxDocuments,
    onSuccess: ({ issued }) => {
      qc.invalidateQueries({ queryKey: GST_KEY });
      push({
        tone: "success",
        title: issued > 0 ? "Documents issued" : "Nothing to issue",
        message: issued > 0
          ? `${issued} GST document${issued === 1 ? "" : "s"} issued.`
          : "Every payment, settlement and refund already has its document.",
      });
    },
    onError: (error) => push({ tone: "error", title: "Could not issue documents", message: errorMessage(error) }),
  });
}

export function useGstProfiles() {
  return useQuery({ queryKey: [...GST_KEY, "profiles"], queryFn: api.fetchGstProfiles });
}

export function useCreateGstProfile() {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: api.createGstProfile,
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: [...GST_KEY, "profiles"] });
      push({ tone: "success", title: "GST profile added", message: `In force from ${profile.effectiveFrom}.` });
    },
    // The dialog shows the message inline, next to the fields it names.
  });
}

// --- Stage 5: monthly returns ---

export function useReturnPeriods() {
  return useQuery({ queryKey: [...GST_KEY, "returns"], queryFn: api.fetchReturnPeriods });
}

export function useReturnWorksheet(month: string | null) {
  return useQuery({
    queryKey: [...GST_KEY, "returns", month],
    queryFn: () => api.fetchReturnWorksheet(month!),
    enabled: !!month,
  });
}

export function useUpdateReturnStatus(month: string) {
  const qc = useQueryClient();
  const push = useToastStore((s) => s.push);
  return useMutation({
    mutationFn: (input: api.ReturnStatusInput) => api.updateReturnStatus(month, input),
    onSuccess: (_row, input) => {
      qc.invalidateQueries({ queryKey: [...GST_KEY, "returns"] });
      push({
        tone: "success",
        title: input.status === "filed" ? "Return marked filed" : "Status updated",
        message: `${input.return === "gstr1" ? "GSTR-1" : "GSTR-3B"} is now ${input.status.replace("_", " ")}.`,
      });
    },
    // The dialog shows the message inline, next to the fields it names.
  });
}
