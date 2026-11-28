import { apiClient } from "./httpClient";

/** Admin-only policy for the "Change billing cycle" action. Singleton. */
export interface BillingCycleSettings {
  id: string;
  /** May an overdue (past_due) rider's billing cycle be changed? */
  allow_overdue_change: boolean;
  /** The most extra days one change may add to the due date. */
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

export interface BillingCycleApplyInput {
  new_due_on: string;
  new_due_time: string;
  reason: string;
  waive_charge?: boolean;
  waive_reason?: string;
  collected_method?: CollectedMethod;
}

/** The charge for a change — computed server-side, identical in preview and apply. */
export interface BillingCycleCharge {
  enabled: boolean;
  period_price: number;
  plan_days: number;
  daily_rate: number;
  hourly_rate: number;
  /** The real extra time on the scooter — display only. */
  extra_minutes: number;
  extra_text: string | null;
  /** Days the due date moves later × daily rate. */
  billable_days: number;
  day_charge: number;
  /** Started hours the clock time moves later (0 if earlier) × hourly rate. */
  billable_hours: number;
  hour_charge: number;
  /** day_charge + hour_charge, rounded up to the rupee. */
  time_charge: number;
  change_fee: number;
  total: number;
  waived: boolean;
  invoice_id: string | null;
  collected?: boolean;
}

export interface BillingCycleChangeInput {
  /** `YYYY-MM-DD` (IST calendar day). */
  new_due_on: string;
  /** `HH:MM`, 24-hour IST. */
  new_due_time: string;
}

export interface BillingCyclePeriodChange {
  sequence_number: number;
  status: "current" | "scheduled";
  old_starts_at: string;
  old_ends_at: string;
  new_starts_at: string;
  new_ends_at: string;
}

/** Identical for preview and apply — the server computes both from one function. */
export interface BillingCycleChangeResult {
  subscription_id: string;
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

/** GET /billing-cycle/settings — requireAdmin. */
export async function fetchBillingCycleSettings(): Promise<BillingCycleSettings> {
  return apiClient.get<BillingCycleSettings>("/billing-cycle/settings");
}

/** PUT /billing-cycle/settings — requireAdmin. */
export async function updateBillingCycleSettings(input: UpdateBillingCycleSettingsInput): Promise<BillingCycleSettings> {
  return apiClient.put<BillingCycleSettings>("/billing-cycle/settings", input);
}

/** POST /billing-cycle/bookings/:id/preview — requireAdmin. Writes nothing. */
export async function previewBillingCycleChange(bookingId: string, input: BillingCycleChangeInput): Promise<BillingCycleChangeResult> {
  return apiClient.post<BillingCycleChangeResult>(`/billing-cycle/bookings/${bookingId}/preview`, input);
}

/** POST /billing-cycle/bookings/:id — requireAdmin. Applies the change and notifies the rider. */
export async function applyBillingCycleChange(
  bookingId: string,
  input: BillingCycleApplyInput,
): Promise<BillingCycleChangeResult> {
  return apiClient.post<BillingCycleChangeResult>(`/billing-cycle/bookings/${bookingId}`, input);
}
