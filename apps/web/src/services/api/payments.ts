import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  Invoice, InvoiceDetail, InvoiceStatus, PaginatedResult, PaymentStatus, PaymentType,
} from "@/types";

export interface InvoiceFilters {
  status?: InvoiceStatus | "all";
  paymentStatus?: PaymentStatus | "all";
  paymentType?: PaymentType | "all";
  bookingId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "amount_due" | "due_date";
  sortDir?: "asc" | "desc";
}

/** GET /invoices — requireStaff. See apps/backend/src/modules/invoices/invoices.routes.ts */
export async function fetchInvoices(filters: InvoiceFilters = {}): Promise<PaginatedResult<Invoice>> {
  const { status, paymentStatus, paymentType, bookingId, page = 1, pageSize = 8, sortBy, sortDir } = filters;
  const res = await apiClient.get<BackendPaginated<Invoice>>("/invoices", {
    page,
    pageSize,
    status: status && status !== "all" ? status : undefined,
    paymentStatus: paymentStatus && paymentStatus !== "all" ? paymentStatus : undefined,
    paymentType: paymentType && paymentType !== "all" ? paymentType : undefined,
    bookingId,
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
 * POST /invoices/:id/refund — requireStaff. Bookkeeping only: flips the
 * invoice's payment_status to "refunded". There's no payment gateway wired
 * into this codebase, so no money actually moves — see the backend service
 * for the full caveat.
 */
export async function refundInvoice(id: string, reason?: string): Promise<Invoice> {
  return apiClient.post<Invoice>(`/invoices/${id}/refund`, { reason });
}
