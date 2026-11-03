import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

/** Mirrors apps/backend/src/modules/purchases/purchases.service.ts. */
export type ItcStatus = "eligible" | "blocked" | "review" | "ineligible";

export interface PurchaseCategory { code: string; label: string; itc: ItcStatus; basis: string; capital?: boolean }

export interface Vendor {
  id: string; name: string; gstin: string | null; pan: string | null; stateCode: string | null;
  address: string | null; kind: string; defaultCategory: string | null;
  contactEmail: string | null; contactPhone: string | null; isActive: boolean;
}

export interface VendorInput {
  name: string; gstin?: string | null; pan?: string | null; stateCode?: string | null; address?: string | null;
  kind: string; defaultCategory?: string | null; contactEmail?: string | null; contactPhone?: string | null;
}

export interface BillLineInput {
  description: string; category: string; taxableAmount: number; gstRate: number;
  itcStatus?: ItcStatus; itcReason?: string | null; isCapital?: boolean;
  cgstAmount?: number; sgstAmount?: number; igstAmount?: number;
}

export interface BillInput {
  vendorId: string; billNumber: string; billDate: string; itcMonth?: string | null;
  isReverseCharge?: boolean; notes?: string | null; lines: BillLineInput[];
}

export interface Bill {
  id: string; vendorId: string; vendorName: string; vendorGstin: string | null;
  billNumber: string; billDate: string; placeOfSupply: string; isReverseCharge: boolean;
  taxableAmount: number; cgstAmount: number; sgstAmount: number; igstAmount: number; totalAmount: number;
  itcMonth: string | null; status: "draft" | "confirmed" | "cancelled"; source: string;
  gstr2bStatus: string; hasFile: boolean; notes: string | null; paidAmount: number; createdAt: string;
}

export interface BillLine {
  id: string; lineNo: number; description: string; category: string; categoryLabel: string;
  taxableAmount: number; gstRate: number; cgstAmount: number; sgstAmount: number; igstAmount: number;
  totalAmount: number; itcStatus: ItcStatus; itcReason: string | null; isCapital: boolean; reverseChargeIgst: number;
}

export interface BillDetail extends Bill {
  lines: BillLine[];
  payments: { lineId: string; date: string | null; amount: number; description: string | null }[];
  cancelReason: string | null;
}

export interface Payable extends Bill { outstanding: number; ageDays: number; rule37Warning: boolean }

type Heads = { cgst: number; sgst: number; igst: number };
export interface ItcSummary {
  month: string;
  eligible: Heads;
  awaiting2b: Heads & { bills: number };
  blocked: Heads;
  review: Heads & { lines: number };
  reverseCharge: { taxable: number; igst: number; bills: number };
  billCount: number;
  drafts: number;
}

export interface TwoBNotInBooks { id: string; supplier: string | null; gstin: string | null; number: string | null; date: string | null; taxable: number; tax: number }

export interface Asset {
  vehicleId: string; registrationNumber: string; model: string | null; purchasedOn: string | null;
  cost: number | null; billNumber: string | null; status: string; writtenDownValue: number | null;
}

export const fetchPurchaseCategories = () => apiClient.get<PurchaseCategory[]>("/purchases/categories");
export const fetchVendors = (search?: string) => apiClient.get<Vendor[]>("/purchases/vendors", { search });
export const createVendor = (input: VendorInput) => apiClient.post<Vendor>("/purchases/vendors", input);
export const updateVendor = (id: string, input: VendorInput) => apiClient.patch<Vendor>(`/purchases/vendors/${id}`, input);

export async function fetchBills(f: {
  from: string; to: string; status?: string; vendorId?: string; search?: string; page?: number; pageSize?: number;
}): Promise<PaginatedResult<Bill>> {
  const res = await apiClient.get<BackendPaginated<Bill>>("/purchases/bills", {
    from: f.from, to: f.to, status: f.status, vendorId: f.vendorId, search: f.search || undefined,
    page: f.page ?? 1, pageSize: f.pageSize ?? 15,
  });
  return toPaginatedResult(res);
}

export const fetchBill = (id: string) => apiClient.get<BillDetail>(`/purchases/bills/${id}`);
export const createBill = (input: BillInput) => apiClient.post<BillDetail>("/purchases/bills", input);
export const updateBill = (id: string, input: BillInput) => apiClient.put<BillDetail>(`/purchases/bills/${id}`, input);
export const confirmBill = (id: string) => apiClient.post<BillDetail>(`/purchases/bills/${id}/confirm`);
export const cancelBill = (id: string, reason: string) => apiClient.post<BillDetail>(`/purchases/bills/${id}/cancel`, { reason });
export const billFileUrl = (id: string) => apiClient.get<{ url: string }>(`/purchases/bills/${id}/file`);
export function uploadBillFile(id: string, file: File): Promise<BillDetail> {
  const form = new FormData();
  form.append("file", file);
  return apiClient.postForm<BillDetail>(`/purchases/bills/${id}/file`, form);
}
export const paymentCandidates = (id: string) =>
  apiClient.get<{ id: string; date: string | null; amount: number; description: string | null; counterparty: string | null }[]>(`/purchases/bills/${id}/payment-candidates`);
export const linkPayment = (id: string, bankLineId: string) => apiClient.post<BillDetail>(`/purchases/bills/${id}/payments`, { bankLineId });
export const unlinkPayment = (id: string, lineId: string) => apiClient.delete<BillDetail>(`/purchases/bills/${id}/payments/${lineId}`);
export const draftFromStatements = (month: string) => apiClient.post<{ created: string[] }>("/purchases/bills/draft-from-statements", { month });

export const fetchPayables = () => apiClient.get<Payable[]>("/purchases/payables");
export const fetchItcSummary = (month: string) => apiClient.get<ItcSummary>("/purchases/itc", { month });
export const fetchTwoBNotInBooks = (month: string) => apiClient.get<TwoBNotInBooks[]>("/purchases/gstr2b/not-in-books", { month });
export function importGstr2b(file: File, month: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("month", month);
  return apiClient.postForm<{ month: string; documents: number; matched: number; notInBooks: number; awaiting: number }>("/purchases/gstr2b", form);
}

export const fetchAssets = (rate: number) => apiClient.get<Asset[]>("/purchases/assets", { rate });
export const setVehicleCost = (vehicleId: string, input: { billLineId: string | null; cost: number; purchasedOn?: string | null }) =>
  apiClient.put<void>(`/purchases/assets/${vehicleId}/cost`, input);
