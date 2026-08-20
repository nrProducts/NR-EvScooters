import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { PaginatedResult } from "@/types";

export interface AttendanceRecord {
  id: string;
  work_date: string;
  check_in_at: string | null;
  check_out_at: string | null;
}

/** week_off = Sunday with no check-in. Checking in ON a Sunday still counts as present. */
export type AttendanceStatus = "present" | "absent" | "on_leave" | "week_off";

export interface RosterEntry {
  user: { id: string; full_name: string; staff_code: string | null };
  status: AttendanceStatus;
  check_in_at: string | null;
  check_out_at: string | null;
}

export interface AdminAttendanceRow extends AttendanceRecord {
  user: { id: string; full_name: string };
}

export interface AttendanceHistoryFilters {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
}

export interface AttendanceLogFilters extends AttendanceHistoryFilters {
  userId?: string;
}

/** POST /attendance/me/check-in — requireStaff. 422 if already checked in today. */
export async function checkIn(): Promise<AttendanceRecord> {
  return apiClient.post<AttendanceRecord>("/attendance/me/check-in");
}

/** POST /attendance/me/check-out — requireStaff. 422 if not checked in, or already checked out. */
export async function checkOut(): Promise<AttendanceRecord> {
  return apiClient.post<AttendanceRecord>("/attendance/me/check-out");
}

/** GET /attendance/me/today — requireStaff. Null if no record for today yet. */
export async function fetchMyAttendanceToday(): Promise<AttendanceRecord | null> {
  return apiClient.get<AttendanceRecord | null>("/attendance/me/today");
}

/** GET /attendance/me/history — requireStaff. Own history only — userId comes from the JWT server-side. */
export async function fetchMyAttendanceHistory(
  filters: AttendanceHistoryFilters = {},
): Promise<PaginatedResult<AttendanceRecord>> {
  const { page = 1, pageSize = 10, from, to } = filters;
  const res = await apiClient.get<BackendPaginated<AttendanceRecord>>("/attendance/me/history", {
    page, pageSize, from, to,
  });
  return toPaginatedResult(res);
}

/** GET /attendance/today — requireAction("attendance","view"). Today's fleet-wide roster with derived status. */
export async function fetchTodayRoster(): Promise<RosterEntry[]> {
  return apiClient.get<RosterEntry[]>("/attendance/today");
}

/** GET /attendance — requireAction("attendance","view"). Fleet-wide historical log. */
export async function fetchAttendanceLog(
  filters: AttendanceLogFilters = {},
): Promise<PaginatedResult<AdminAttendanceRow>> {
  const { page = 1, pageSize = 10, from, to, userId } = filters;
  const res = await apiClient.get<BackendPaginated<AdminAttendanceRow>>("/attendance", {
    page, pageSize, from, to, userId,
  });
  return toPaginatedResult(res);
}
