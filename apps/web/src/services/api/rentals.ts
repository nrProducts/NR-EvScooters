import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";

export interface AdminRentalRow {
  id: string;
  status: RentalStatus;
  started_at: string;
  ended_at: string | null;
  start_battery_pct: number | null;
  end_battery_pct: number | null;
  fare: number | null;
  rider: { id: string; full_name: string; phone: string | null } | null;
  vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
  return_requested_at: string | null;
  return_reason: string | null;
  return_feedback: string | null;
  return_due_at: string | null;
  return_approved_at: string | null;
  return_approved_by: { id: string; full_name: string } | null;
  days_late: number | null;
  late_penalty_amount: number | null;
  late_fee_per_day: number | null;
  inspected_at: string | null;
  inspected_by: { id: string; full_name: string } | null;
  /** Set once by vehicle-recovery-sweep; never cleared. */
  recovery_flagged_at: string | null;
  /** RENEWAL late fee for a lapsed, unpaid plan — the "pay before returning" gate. Distinct from late_fee_per_day above (the RETURN-lateness fee). Null when there's no subscription to be overdue against. */
  overdue_late_fee: { isLate: boolean; daysLate: number; lateFee: number; isSettled: boolean } | null;
}

export interface RentalFilters {
  page?: number;
  pageSize?: number;
  status?: RentalStatus;
  /** Active rentals flagged by vehicle-recovery-sweep — the "awaiting recovery" tab. */
  recoveryRequired?: boolean;
}

/** GET /rentals — requireStaff. Fleet-wide "Ride Management" list. */
export async function fetchRentals(filters: RentalFilters = {}): Promise<PaginatedResult<AdminRentalRow>> {
  const { page = 1, pageSize = 8, status, recoveryRequired } = filters;
  const res = await apiClient.get<BackendPaginated<AdminRentalRow>>("/rentals", {
    page, pageSize, status, recoveryRequired,
  });
  return toPaginatedResult(res);
}

export interface CompleteRideInput {
  end_battery_pct?: number;
  /** Staff-customised late fee; omit to use the computed amount. */
  late_fee_override?: number;
  /** Confirms a clean inspection when no damage was recorded — required whenever the booking has a held deposit and inspected_at isn't already stamped. */
  inspected?: boolean;
}

/** POST /rentals/:id/complete — requireStaff. Ends the ride; the DB trigger returns the vehicle to 'available'. Also the "Approve Return" action when a return was pending. */
export async function completeRide(id: string, input: CompleteRideInput = {}): Promise<AdminRentalRow> {
  return apiClient.post<AdminRentalRow>(`/rentals/${id}/complete`, input);
}

export interface MoveToMaintenanceInput {
  description: string;
  end_battery_pct?: number;
  /** Staff-customised late fee; omit to use the computed amount. */
  late_fee_override?: number;
  /** Confirms a clean inspection when no damage was recorded — required whenever the booking has a held deposit and inspected_at isn't already stamped. */
  inspected?: boolean;
}

/** POST /rentals/:id/maintenance — requireStaff. Ends the ride, flips the vehicle to 'maintenance', and opens a ticket. Also the "Approve Return" (inspection) action when a return was pending. */
export async function moveRideToMaintenance(id: string, input: MoveToMaintenanceInput): Promise<AdminRentalRow> {
  return apiClient.post<AdminRentalRow>(`/rentals/${id}/maintenance`, input);
}

export interface RejectReturnInput {
  reason: string;
}

/** POST /rentals/:id/return-reject — requireStaff. Declines a pending return request; the rental stays active. */
export async function rejectReturn(id: string, input: RejectReturnInput): Promise<AdminRentalRow> {
  return apiClient.post<AdminRentalRow>(`/rentals/${id}/return-reject`, input);
}
