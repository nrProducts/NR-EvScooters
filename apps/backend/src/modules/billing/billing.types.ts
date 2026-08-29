/**
 * Charges and discounts were two of everything: `charge_rules` +
 * `discount_rules`, `rider_charges` + `rider_discounts`, two admin screens,
 * two sets of endpoints, and two near-identical halves of this module.
 *
 * They are one of each now — `pricing_rules` and `subscription_adjustments` —
 * distinguished by a `kind` (`charge` / `discount`) and, in the adjustment, by
 * the SIGN of the amount. A discount is a negative charge, which is what it
 * always was arithmetically; keeping them apart meant every total had to
 * remember to subtract one set and add the other.
 *
 * The wire types below keep both vocabularies so neither app has to change in
 * this stage. The service maps them onto the single table.
 */

/**
 * `pricing_rules.code` is free text — a rule's code is data, not an enum, so
 * an operator can add a new charge type without a deploy. The old union is
 * retained only as the set of codes the system ships with, for the console's
 * dropdown.
 */
export type ChargeCode = string;
export const CHARGE_CODES: readonly string[] = [
    // ONE late fee — the same rate covers a late renewal and a late return.
    // Cancellation charges are configured as tiers on the Cancellation Policy
    // tab, not as a charge rule.
    "transaction_fee", "late_fee", "damage", "cleaning", "extension", "other",
] as const;

export type DiscountCode = string;
export const DISCOUNT_CODES: readonly string[] = [
    "welcome_discount", "referral", "loyalty", "promotional", "other",
] as const;

export type ChargeAmountType = "fixed" | "percentage";

/**
 * `rule_frequency`. Two renames: `every_cycle` → `every_period` and
 * `every_n_cycles` → `every_n_periods`, because the thing being counted is a
 * subscription period. `per_booking` is gone — it meant "once", which is what
 * `one_time` already meant — and `first_n_periods` is new.
 */
export type ChargeFrequencyType =
    "one_time" | "every_period" | "every_n_periods" | "first_n_periods" | "per_day";

/**
 * `rule_scope`. Was global/vehicle only; a rule can now also be scoped to a
 * plan, a vehicle model or a single subscription, which is what made the
 * per-subscription late-fee override expressible without a new column.
 */
export type ChargeRuleScope = "global" | "plan" | "vehicle_model" | "vehicle" | "subscription";

/** `adjustment_status`. `cancelled` is `voided`; `paid` is `settled`. */
export type RiderChargeStatus = "pending" | "invoiced" | "settled" | "voided";

export interface ChargeRuleRow {
    id: string;
    /** `pricing_rules.code`. */
    charge_code: ChargeCode;
    /** `pricing_rules.name`. */
    charge_name: string;
    description: string | null;
    amount_type: ChargeAmountType;
    amount: number;
    /** `pricing_rules.frequency`. */
    frequency_type: ChargeFrequencyType;
    frequency_n: number | null;
    scope: ChargeRuleScope;
    /** `scope_ref_id`, surfaced under its old name when the scope is a vehicle. */
    vehicle_id: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
    effective_from: string;
    effective_to: string | null;
    /** `is_active`. */
    active: boolean;
    /** `created_by_user_id`. */
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
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

/** Rider/vehicle summary joined in for display. */
export interface RiderChargeBookingSummary {
    id: string;
    rider_name: string | null;
    rider_phone: string | null;
    vehicle_model_name: string | null;
}

export interface RiderChargeRow {
    id: string;
    /** Resolved through `subscriptions.booking_id`. */
    booking_id: string;
    subscription_id: string;
    /** `pricing_rule_id`. */
    charge_rule_id: string | null;
    /** `code_snapshot`. */
    charge_code: ChargeCode;
    /** `name_snapshot`. */
    charge_name: string;
    /** Always POSITIVE here, whatever the sign in the table. */
    amount: number;
    /** The period's `sequence_number`. Was `billing_cycle_number`. */
    billing_cycle_number: number | null;
    status: RiderChargeStatus;
    /**
     * Waiving.
     *
     * There is no `waived_amount` column: an adjustment is voided whole, and
     * a PARTIAL waiver is expressed as a second, negative adjustment — which
     * is both more honest (the original charge stands, and the credit is
     * visible) and what "signed amounts" buys. `waived_amount` therefore
     * reports the credit, and `waived_reason` the void reason.
     */
    waived_amount: number | null;
    waived_reason: string | null;
    waived_by: { id: string; full_name: string } | null;
    /** `voided_at`. */
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
// Discounts — the same two tables, filtered to kind='discount'.
// ---------------------------------------------------------------------------

export type DiscountAmountType = ChargeAmountType;
export type DiscountRuleScope = ChargeRuleScope;
export type RiderDiscountStatus = RiderChargeStatus;

export interface DiscountRuleRow {
    id: string;
    discount_code: DiscountCode;
    discount_name: string;
    description: string | null;
    /** `amount_type`. */
    discount_type: DiscountAmountType;
    /** `amount`. */
    value: number;
    frequency_type: ChargeFrequencyType;
    frequency_n: number | null;
    scope: DiscountRuleScope;
    vehicle_id: string | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
    effective_from: string;
    effective_to: string | null;
    active: boolean;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface ListDiscountRulesFilters {
    page: number;
    pageSize: number;
    discountCode?: DiscountCode;
    scope?: DiscountRuleScope;
    vehicleId?: string;
    active?: boolean;
}

export interface CreateDiscountRuleInput {
    discount_code: DiscountCode;
    discount_name: string;
    description?: string | null;
    discount_type: DiscountAmountType;
    value: number;
    frequency_type: ChargeFrequencyType;
    frequency_n?: number | null;
    scope: DiscountRuleScope;
    vehicle_id?: string | null;
    effective_from?: string;
    effective_to?: string | null;
    active?: boolean;
}

export type UpdateDiscountRuleInput =
    Partial<Omit<CreateDiscountRuleInput, "discount_code" | "scope" | "vehicle_id">>;

export interface RiderDiscountRow {
    id: string;
    booking_id: string;
    subscription_id: string;
    discount_rule_id: string | null;
    discount_code: DiscountCode;
    discount_name: string;
    discount_type: DiscountAmountType;
    /** Always POSITIVE here — the table stores it negative. */
    amount: number;
    billing_cycle_number: number | null;
    status: RiderDiscountStatus;
    /** `void_reason`. */
    cancel_reason: string | null;
    cancelled_by: { id: string; full_name: string } | null;
    /** `voided_at`. */
    cancelled_at: string | null;
    invoice_id: string | null;
    created_at: string;
    booking: RiderChargeBookingSummary | null;
}

export interface ListRiderDiscountsFilters {
    page: number;
    pageSize: number;
    bookingId?: string;
    status?: RiderDiscountStatus;
}

export interface CancelRiderDiscountInput {
    reason: string;
}
