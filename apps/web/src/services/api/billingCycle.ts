import { apiClient } from "./httpClient";

/** Admin-only policy for the "Change billing cycle" action. Singleton. */
export interface BillingCycleSettings {
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
  input: BillingCycleChangeInput & { reason: string },
): Promise<BillingCycleChangeResult> {
  return apiClient.post<BillingCycleChangeResult>(`/billing-cycle/bookings/${bookingId}`, input);
}
