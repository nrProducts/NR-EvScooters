export interface BillingCycleSettingsRow {
    id: string;
    /** May an overdue (past_due) rider's billing cycle be changed? */
    allow_overdue_change: boolean;
    /** The most free days one change may add to the due date. */
    max_extra_days: number;
    /** Bill extra time at the rider's plan rate, per started hour. */
    charge_enabled: boolean;
    /** Flat fee on every change while charging is on. 0 = none. */
    change_fee: number;
    updated_at: string | null;
}

export interface UpdateBillingCycleSettingsInput {
    allow_overdue_change: boolean;
    max_extra_days: number;
    charge_enabled: boolean;
    change_fee: number;
}

export type CollectedMethod = "cash" | "upi" | "card" | "netbanking" | "wallet";

export interface ChangeBillingCycleInput {
    /** `YYYY-MM-DD`, the new due date (IST calendar day). */
    new_due_on: string;
    /** `HH:MM`, 24-hour IST clock time. */
    new_due_time: string;
    reason?: string;
    /** Waive the charge (a change made for our own reasons). Needs `waive_reason`. */
    waive_charge?: boolean;
    waive_reason?: string;
    /** The charge was collected at the counter — record it paid by this method. */
    collected_method?: CollectedMethod;
}

/** The charge for a change, computed by the database function. */
export interface BillingCycleCharge {
    enabled: boolean;
    period_price: number;
    plan_days: number;
    daily_rate: number;
    hourly_rate: number;
    /** The real extra time on the scooter — display only. */
    extra_minutes: number;
    extra_text: string | null;
    /** Days the due DATE moves later, billed at `daily_rate`. */
    billable_days: number;
    day_charge: number;
    /** Started hours the clock TIME moves later (0 if earlier), billed at `hourly_rate`. */
    billable_hours: number;
    hour_charge: number;
    /** day_charge + hour_charge, rounded up to the rupee. */
    time_charge: number;
    change_fee: number;
    total: number;
    waived: boolean;
    /** The ad-hoc bill raised on apply; null on preview, when free, or when waived. */
    invoice_id: string | null;
    /** Apply only: whether a counter collection was recorded against the bill. */
    collected?: boolean;
}

export interface BillingCyclePeriodChange {
    sequence_number: number;
    status: "current" | "scheduled";
    old_starts_at: string;
    old_ends_at: string;
    new_starts_at: string;
    new_ends_at: string;
}

/** What `public.change_billing_cycle` returns — identical for preview and apply. */
export interface BillingCycleChangeResult {
    subscription_id: string;
    user_id: string;
    applied: boolean;
    old_due_on: string;
    old_cycle_time: string;
    old_due_at: string;
    new_due_on: string;
    new_cycle_time: string;
    new_due_at: string;
    extra_days: number;
    max_extra_days: number;
    status_before: string;
    status_after: string;
    periods: BillingCyclePeriodChange[];
    rental_id: string;
    old_due_back_at: string;
    new_due_back_at: string;
    clears_recovery_flag: boolean;
    invoices_moved: number;
    charge: BillingCycleCharge;
}
