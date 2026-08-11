export type BillingCycle = "daily" | "weekly" | "monthly" | "yearly";
export const BILLING_CYCLES: readonly BillingCycle[] = ["daily", "weekly", "monthly", "yearly"] as const;

export interface PlanRow {
    id: string;
    name: string;
    billing_cycle: BillingCycle;
    price: number;
    included_minutes: number | null;
    /** Source of truth for all recurring-billing date math — billing_cycle is display-only. */
    duration_days: number;
    deposit_amount: number;
    vehicle_model_id: string | null;
    active: boolean;
    created_at: string;
    updated_at: string | null;
}

export interface ListPlansFilters {
    page: number;
    pageSize: number;
    vehicleModelId?: string;
    active?: boolean;
    sortBy: "created_at" | "name" | "price";
    sortDir: "asc" | "desc";
}

export interface CreatePlanInput {
    name: string;
    billing_cycle: BillingCycle;
    price: number;
    duration_days: number;
    deposit_amount: number;
    vehicle_model_id: string;
    included_minutes?: number | null;
    active?: boolean;
}

/** vehicle_model_id is deliberately excluded — a plan doesn't change which model it's for after creation. */
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, "vehicle_model_id">>;

export type PlanResumeReason = "temp_vehicle" | "original_handback" | "replacement";
