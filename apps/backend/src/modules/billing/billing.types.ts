export type ChargeCode =
    | "transaction_fee" | "late_payment_fee" | "late_return_fee" | "damage"
    | "cleaning" | "cancellation" | "extension" | "other";
export const CHARGE_CODES: readonly ChargeCode[] = [
    "transaction_fee", "late_payment_fee", "late_return_fee", "damage",
    "cleaning", "cancellation", "extension", "other",
] as const;

export type ChargeAmountType = "fixed" | "percentage";
export type ChargeFrequencyType = "one_time" | "every_cycle" | "every_n_cycles" | "per_booking" | "per_day";
export type ChargeRuleScope = "global" | "vehicle";
export type RiderChargeStatus = "pending" | "invoiced" | "paid" | "waived" | "cancelled";

export interface ChargeRuleRow {
    id: string;
    charge_code: ChargeCode;
    charge_name: string;
    description: string | null;
    amount_type: ChargeAmountType;
    amount: number;
    frequency_type: ChargeFrequencyType;
    frequency_n: number | null;
    scope: ChargeRuleScope;
    vehicle_id: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
    effective_from: string;
    effective_to: string | null;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface ListChargeRulesFilters {
    page: number;
    pageSize: number;
    chargeCode?: ChargeCode;
    scope?: ChargeRuleScope;
    vehicleId?: string;
    active?: boolean;
}

export interface CreateChargeRuleInput {
    charge_code: ChargeCode;
    charge_name: string;
    description?: string | null;
    amount_type: ChargeAmountType;
    amount: number;
    frequency_type: ChargeFrequencyType;
    frequency_n?: number | null;
    scope: ChargeRuleScope;
    vehicle_id?: string | null;
    effective_from?: string;
    effective_to?: string | null;
    active?: boolean;
}

export type UpdateChargeRuleInput = Partial<Omit<CreateChargeRuleInput, "charge_code" | "scope" | "vehicle_id">>;

/** Rider/vehicle summary joined in for display — mirrors RefundBookingSummary's shape. */
export interface RiderChargeBookingSummary {
    id: string;
    rider_name: string | null;
    rider_phone: string | null;
    vehicle_model_name: string | null;
}

export interface RiderChargeRow {
    id: string;
    booking_id: string;
    charge_rule_id: string | null;
    charge_code: ChargeCode;
    charge_name: string;
    amount: number;
    billing_cycle_number: number | null;
    status: RiderChargeStatus;
    waived_amount: number | null;
    waived_reason: string | null;
    waived_by: { id: string; full_name: string } | null;
    waived_at: string | null;
    invoice_id: string | null;
    created_at: string;
    booking: RiderChargeBookingSummary | null;
}

export interface ListRiderChargesFilters {
    page: number;
    pageSize: number;
    bookingId?: string;
    status?: RiderChargeStatus;
}

export interface WaiveRiderChargeInput {
    waived_amount: number;
    reason: string;
}

// ---------------------------------------------------------------------------
// Discount Rules — mirrors Charge Rules exactly (see the file header comment
// in 20260817120000_discount_rules_engine.sql for why).
// ---------------------------------------------------------------------------

export type DiscountCode = "loyalty" | "promotional" | "seasonal" | "referral" | "other";
export const DISCOUNT_CODES: readonly DiscountCode[] = [
    "loyalty", "promotional", "seasonal", "referral", "other",
] as const;

/** "Duration: N Billing Cycles" (spec) applies to cycles 1..N — distinct from a charge's every_n_cycles (multiples of N). */
export type DiscountFrequencyType = "one_time" | "every_cycle" | "first_n_cycles";
export type RiderDiscountStatus = "pending" | "applied" | "cancelled";

export interface DiscountRuleRow {
    id: string;
    discount_code: DiscountCode;
    discount_name: string;
    description: string | null;
    discount_type: ChargeAmountType;
    value: number;
    frequency_type: DiscountFrequencyType;
    frequency_n: number | null;
    scope: ChargeRuleScope;
    vehicle_id: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
    effective_from: string;
    effective_to: string | null;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface ListDiscountRulesFilters {
    page: number;
    pageSize: number;
    discountCode?: DiscountCode;
    scope?: ChargeRuleScope;
    vehicleId?: string;
    active?: boolean;
}

export interface CreateDiscountRuleInput {
    discount_code: DiscountCode;
    discount_name: string;
    description?: string | null;
    discount_type: ChargeAmountType;
    value: number;
    frequency_type: DiscountFrequencyType;
    frequency_n?: number | null;
    scope: ChargeRuleScope;
    vehicle_id?: string | null;
    effective_from?: string;
    effective_to?: string | null;
    active?: boolean;
}

export type UpdateDiscountRuleInput = Partial<Omit<CreateDiscountRuleInput, "discount_code" | "scope" | "vehicle_id">>;

export interface RiderDiscountRow {
    id: string;
    booking_id: string;
    discount_rule_id: string | null;
    discount_code: DiscountCode;
    discount_name: string;
    discount_type: ChargeAmountType;
    amount: number;
    billing_cycle_number: number | null;
    status: RiderDiscountStatus;
    cancel_reason: string | null;
    cancelled_by: { id: string; full_name: string } | null;
    cancelled_at: string | null;
    invoice_id: string | null;
    created_at: string;
    booking: RiderChargeBookingSummary | null;
}

export interface CancelRiderDiscountInput {
    reason: string;
}

export interface ListRiderDiscountsFilters {
    page: number;
    pageSize: number;
    bookingId?: string;
    status?: RiderDiscountStatus;
}
