import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  Invoice, InvoiceDetail, InvoicePaymentState, InvoicePurpose, InvoiceStatus, PaginatedResult,
} from "@/types";

export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  /** Derived server-side from the allocations. Was `paymentStatus`. */
  paymentState?: InvoicePaymentState | "all";
  /** Was `paymentType`. */
  purpose?: InvoicePurpose | "all";
  bookingId?: string;
  userId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "total_amount" | "due_on";
  sortDir?: "asc" | "desc";
}

/** GET /invoices — requireStaff. See apps/backend/src/modules/invoices/invoices.routes.ts */
export async function fetchInvoices(filters: InvoiceFilters = {}): Promise<PaginatedResult<Invoice>> {
  const {
    status, paymentState, purpose, bookingId, userId, page = 1, pageSize = 8, sortBy, sortDir,
  } = filters;
  const res = await apiClient.get<BackendPaginated<Invoice>>("/invoices", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    paymentState: paymentState && paymentState !== "all" ? paymentState : undefined,
    purpose: purpose && purpose !== "all" ? purpose : undefined,
    bookingId,
    userId,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** GET /invoices/:id */
export async function fetchInvoiceById(id: string): Promise<InvoiceDetail> {
  return apiClient.get<InvoiceDetail>(`/invoices/${id}`);
}

/**
 * POST /invoices/:id/refund — gated on `payments.refund`, NOT `payments.view`.
 *
 * **This moves real money.** The comment here used to say the opposite —
 * "bookkeeping only… no payment gateway wired into this codebase" — which
 * stopped being true when the Razorpay integration landed and was still on
 * screen for anyone reading the client. It creates a `refunds` row against
 * the payment that settled this invoice; a subsequent `POST /refunds/:id/retry`
 * submits it to Razorpay as an actual payout.
 *
 * There is also no `payment_status` to flip any more: paid-ness is derived
 * from `payment_allocations` by `v_invoice_balances`.
 */
export async function refundInvoice(id: string, reason?: string): Promise<Invoice> {
  return apiClient.post<Invoice>(`/invoices/${id}/refund`, { reason });
}
