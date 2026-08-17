import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type {
  ChargeAmountType, ChargeCode, ChargeFrequencyType, ChargeRule, ChargeRuleScope,
  DiscountCode, DiscountFrequencyType, DiscountRule, PaginatedResult, RiderCharge, RiderChargeStatus,
  RiderDiscount, RiderDiscountStatus,
} from "@/types";

export interface ChargeRuleFilters {
  chargeCode?: ChargeCode | "all";
  scope?: ChargeRuleScope | "all";
  vehicleId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** GET /billing/charge-rules — requireAction("billing","view"). See apps/backend/src/modules/billing/billing.routes.ts */
export async function fetchChargeRules(filters: ChargeRuleFilters = {}): Promise<PaginatedResult<ChargeRule>> {
  const { chargeCode, scope, vehicleId, active, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<ChargeRule>>("/billing/charge-rules", {
    page,
    pageSize,
    chargeCode: chargeCode && chargeCode !== "all" ? chargeCode : undefined,
    scope: scope && scope !== "all" ? scope : undefined,
    vehicleId,
    active,
  });
  return toPaginatedResult(res);
}

export interface CreateChargeRuleInput {
  charge_code: ChargeCode;
  charge_name: string;
  description?: string;
  amount_type: ChargeAmountType;
  amount: number;
  frequency_type: ChargeFrequencyType;
  frequency_n?: number;
  scope: ChargeRuleScope;
  vehicle_id?: string;
  effective_from?: string;
  effective_to?: string;
  active?: boolean;
}

export async function createChargeRule(input: CreateChargeRuleInput): Promise<ChargeRule> {
  return apiClient.post<ChargeRule>("/billing/charge-rules", input);
}

export type UpdateChargeRuleInput = Partial<
  Omit<CreateChargeRuleInput, "charge_code" | "scope" | "vehicle_id">
>;

export async function updateChargeRule(id: string, patch: UpdateChargeRuleInput): Promise<ChargeRule> {
  return apiClient.patch<ChargeRule>(`/billing/charge-rules/${id}`, patch);
}

export interface RiderChargeFilters {
  bookingId?: string;
  status?: RiderChargeStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /billing/rider-charges — requireAction("billing","view"). */
export async function fetchRiderCharges(filters: RiderChargeFilters = {}): Promise<PaginatedResult<RiderCharge>> {
  const { bookingId, status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<RiderCharge>>("/billing/rider-charges", {
    page,
    pageSize,
    bookingId,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** POST /billing/rider-charges/:id/waive — requireAction("billing","edit"). Never deletes the charge — keeps original/waived/final amounts on record. */
export async function waiveRiderCharge(id: string, input: { waived_amount: number; reason: string }): Promise<RiderCharge> {
  return apiClient.post<RiderCharge>(`/billing/rider-charges/${id}/waive`, input);
}

export interface DiscountRuleFilters {
  discountCode?: DiscountCode | "all";
  scope?: ChargeRuleScope | "all";
  vehicleId?: string;
  active?: boolean;
  page?: number;
  pageSize?: number;
}

/** GET /billing/discount-rules — requireAction("billing","view"). */
export async function fetchDiscountRules(filters: DiscountRuleFilters = {}): Promise<PaginatedResult<DiscountRule>> {
  const { discountCode, scope, vehicleId, active, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<DiscountRule>>("/billing/discount-rules", {
    page,
    pageSize,
    discountCode: discountCode && discountCode !== "all" ? discountCode : undefined,
    scope: scope && scope !== "all" ? scope : undefined,
    vehicleId,
    active,
  });
  return toPaginatedResult(res);
}

export interface CreateDiscountRuleInput {
  discount_code: DiscountCode;
  discount_name: string;
  description?: string;
  discount_type: ChargeAmountType;
  value: number;
  frequency_type: DiscountFrequencyType;
  frequency_n?: number;
  scope: ChargeRuleScope;
  vehicle_id?: string;
  effective_from?: string;
  effective_to?: string;
  active?: boolean;
}

export async function createDiscountRule(input: CreateDiscountRuleInput): Promise<DiscountRule> {
  return apiClient.post<DiscountRule>("/billing/discount-rules", input);
}

export type UpdateDiscountRuleInput = Partial<
  Omit<CreateDiscountRuleInput, "discount_code" | "scope" | "vehicle_id">
>;

export async function updateDiscountRule(id: string, patch: UpdateDiscountRuleInput): Promise<DiscountRule> {
  return apiClient.patch<DiscountRule>(`/billing/discount-rules/${id}`, patch);
}

export interface RiderDiscountFilters {
  bookingId?: string;
  status?: RiderDiscountStatus | "all";
  page?: number;
  pageSize?: number;
}

/** GET /billing/rider-discounts — requireAction("billing","view"). */
export async function fetchRiderDiscounts(filters: RiderDiscountFilters = {}): Promise<PaginatedResult<RiderDiscount>> {
  const { bookingId, status, page = 1, pageSize = 8 } = filters;
  const res = await apiClient.get<BackendPaginated<RiderDiscount>>("/billing/rider-discounts", {
    page,
    pageSize,
    bookingId,
    status: status && status !== "all" ? status : undefined,
  });
  return toPaginatedResult(res);
}

/** POST /billing/rider-discounts/:id/cancel — requireAction("billing","edit"). Never deletes the row — keeps the reason on record. */
export async function cancelRiderDiscount(id: string, input: { reason: string }): Promise<RiderDiscount> {
  return apiClient.post<RiderDiscount>(`/billing/rider-discounts/${id}/cancel`, input);
}
