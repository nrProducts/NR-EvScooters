import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { Invoice, InvoiceDetail, InvoiceStatus, PaginatedResult, PaymentStatus } from "@/types";

export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /invoices — requireStaff. See apps/backend/src/modules/invoices/invoices.routes.ts */
export async function fetchInvoices(filters: InvoiceFilters = {}): Promise<PaginatedResult<Invoice>> {
  const { status, paymentStatus, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<Invoice>>("/invoices", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    paymentStatus: paymentStatus && paymentStatus !== "all" ? paymentStatus : undefined,
  });
  return toPaginatedResult(res);
}

/** GET /invoices/:id */
export async function fetchInvoiceById(id: string): Promise<InvoiceDetail> {
  return apiClient.get<InvoiceDetail>(`/invoices/${id}`);
}

/**
 * POST /invoices/:id/refund — requireStaff. Bookkeeping only: flips the
 * invoice's payment_status to "refunded". There's no payment gateway wired
 * into this codebase, so no money actually moves — see the backend service
 * for the full caveat.
 */
export async function refundInvoice(id: string, reason?: string): Promise<Invoice> {
  return apiClient.post<Invoice>(`/invoices/${id}/refund`, { reason });
}
