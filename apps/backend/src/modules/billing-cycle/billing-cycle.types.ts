export interface BillingCycleSettingsRow {
    id: string;
    /** May an overdue (past_due) rider's billing cycle be changed? */
    allow_overdue_change: boolean;
    /** The most free days one change may add to the due date. */
    max_extra_days: number;
    updated_at: string | null;
}

export interface UpdateBillingCycleSettingsInput {
    allow_overdue_change: boolean;
    max_extra_days: number;
}

export interface ChangeBillingCycleInput {
    /** `YYYY-MM-DD`, the new due date (IST calendar day). */
    new_due_on: string;
    /** `HH:MM`, 24-hour IST clock time. */
    new_due_time: string;
    reason?: string;
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
}
