import { useToastStore } from "@/store/toastStore";
import { ApiError } from "@/services/api/httpClient";

/** Success feedback for a completed admin/staff action. */
export function toastSuccess(title: string, message?: string) {
  useToastStore.getState().push({ tone: "success", title, message: message ?? "" });
}

/**
 * Error feedback for a failed mutation — unwraps ApiError.message the same
 * way every page's inline error banner already does, so the toast and any
 * inline text next to it never disagree.
 */
export function toastError(err: unknown, fallbackTitle: string) {
  const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
  useToastStore.getState().push({ tone: "error", title: fallbackTitle, message });
}
