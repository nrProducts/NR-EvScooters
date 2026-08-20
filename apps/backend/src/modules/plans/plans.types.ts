/**
 * `yearly` is gone — the `billing_period` enum has three values, and no plan
 * ever used the fourth. Kept as the same type name so call sites read the same.
 */
export type BillingCycle = "daily" | "weekly" | "monthly";
export const BILLING_CYCLES: readonly BillingCycle[] = ["daily", "weekly", "monthly"] as const;

export interface PlanRow {
    id: string;
    name: string;
    /** `plans.billing_period` on the way in and out. */
    billing_cycle: BillingCycle;
    /** `plans.price_amount`. */
    price: number;
    /** No column backs this any more; always null. */
    included_minutes: number | null;
    /** Source of truth for all recurring-billing date math — billing_cycle is display-only. */
    duration_days: number;
    deposit_amount: number;
    /** NOT NULL in the new schema: a plan is always for one model. */
    vehicle_model_id: string;
    /** `plans.is_active`. */
    active: boolean;
    created_at: string;
    updated_at: string | null;
}

export interface ListPlansFilters {
    page: number;
    pageSize: number;
    vehicleModelId?: string;
    active?: boolean;
    sortBy: "created_at" | "name" | "price_amount";
    sortDir: "asc" | "desc";
}

export interface CreatePlanInput {
    name: string;
    billing_cycle: BillingCycle;
    price: number;
    duration_days: number;
    deposit_amount: number;
    vehicle_model_id: string;
    /** Accepted and ignored — there is nowhere to store it. */
    included_minutes?: number | null;
    active?: boolean;
}

/** vehicle_model_id is deliberately excluded — a plan doesn't change which model it's for after creation. */
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "vehicle_model_id">>;

export type PlanResumeReason = "temp_vehicle" | "original_handback" | "replacement";
