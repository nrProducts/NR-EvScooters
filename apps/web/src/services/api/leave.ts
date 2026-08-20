import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

export type LeaveRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  annual_quota_days: number;
}

export interface LeaveBalance extends LeaveType {
  used_days: number;
  remaining_days: number;
}

export interface LeaveRequest {
  id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  /** Working days only — Sundays and government holidays within the range are excluded, see the preview below. */
  days: number;
  reason: string | null;
  status: LeaveRequestStatus;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type LeaveDayKind = "leave" | "week_off" | "holiday";

export interface LeaveDayBreakdown {
  date: string;
  kind: LeaveDayKind;
  holiday_name?: string;
  already_applied?: boolean;
}

export interface LeavePreview {
  days: LeaveDayBreakdown[];
  leave_day_count: number;
  has_overlap: boolean;
}

export interface AdminLeaveRequest extends LeaveRequest {
  user: { id: string; full_name: string };
  reviewed_by: { id: string; full_name: string } | null;
}

export interface ApplyLeaveInput {
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

export interface LeaveFilters {
  page?: number;
  pageSize?: number;
  status?: LeaveRequestStatus;
}

export interface LeaveLogFilters extends LeaveFilters {
  userId?: string;
  leaveTypeId?: string;
}

/** GET /leave/types — requireStaff. Active leave types only. */
export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  return apiClient.get<LeaveType[]>("/leave/types");
}

/** GET /leave/me/balance — requireStaff. Remaining balance per type for the current year. */
export async function fetchMyLeaveBalance(): Promise<LeaveBalance[]> {
  return apiClient.get<LeaveBalance[]>("/leave/me/balance");
}

/** GET /leave/me — requireStaff. Own requests only — userId comes from the JWT server-side. */
export async function fetchMyLeaveRequests(filters: LeaveFilters = {}): Promise<PaginatedResult<LeaveRequest>> {
  const { page = 1, pageSize = 10, status } = filters;
  const res = await apiClient.get<BackendPaginated<LeaveRequest>>("/leave/me", { page, pageSize, status });
  return toPaginatedResult(res);
}

/**
 * GET /leave/me/preview — requireStaff. Date-by-date breakdown (Leave / Week
 * Off / Holiday) plus an overlap flag, shown before final submission. A
 * courtesy only — applyForLeave re-validates everything server-side
 * regardless of what this returned.
 */
export async function previewLeave(startDate: string, endDate: string): Promise<LeavePreview> {
  return apiClient.get<LeavePreview>("/leave/me/preview", { start_date: startDate, end_date: endDate });
}

/** POST /leave/me — requireStaff. 422 if it exceeds the remaining balance, overlaps an existing request, or covers no working days. */
export async function applyForLeave(input: ApplyLeaveInput): Promise<LeaveRequest> {
  return apiClient.post<LeaveRequest>("/leave/me", input);
}

/** POST /leave/me/:id/cancel — requireStaff. Only a pending request of your own can be cancelled. */
export async function cancelMyLeaveRequest(id: string): Promise<LeaveRequest> {
  return apiClient.post<LeaveRequest>(`/leave/me/${id}/cancel`);
}

/** GET /leave — requireAction("leave","view"). Fleet-wide leave requests. */
export async function fetchLeaveRequests(filters: LeaveLogFilters = {}): Promise<PaginatedResult<AdminLeaveRequest>> {
  const { page = 1, pageSize = 10, status, userId, leaveTypeId } = filters;
  const res = await apiClient.get<BackendPaginated<AdminLeaveRequest>>("/leave", {
    page, pageSize, status, userId, leaveTypeId,
  });
  return toPaginatedResult(res);
}

/** POST /leave/:id/approve — requireAction("leave","approve"). */
export async function approveLeaveRequest(id: string, reviewNote?: string): Promise<AdminLeaveRequest> {
  return apiClient.post<AdminLeaveRequest>(`/leave/${id}/approve`, { review_note: reviewNote });
}

/** POST /leave/:id/reject — requireAction("leave","approve"). review_note is required. */
export async function rejectLeaveRequest(id: string, reviewNote: string): Promise<AdminLeaveRequest> {
  return apiClient.post<AdminLeaveRequest>(`/leave/${id}/reject`, { review_note: reviewNote });
}
