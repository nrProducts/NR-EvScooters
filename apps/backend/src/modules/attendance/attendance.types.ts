/** week_off = Sunday with no check-in — see isWeeklyOff() in attendance.service.ts. Checking in ON a Sunday still counts as present. */
export type AttendanceStatus = "present" | "absent" | "on_leave" | "week_off";

export interface AttendanceRecordView {
    id: string;
    work_date: string;
    check_in_at: string | null;
    check_out_at: string | null;
}

interface AttendanceUserRef {
    id: string;
    full_name: string;
}

/** Admin/staff view — same row, plus who it belongs to. */
export interface AdminAttendanceRow extends AttendanceRecordView {
    user: AttendanceUserRef;
}

/** Today's roster, one row per active staff/admin account — the admin dashboard/attendance page's default view. */
export interface RosterEntry {
    user: AttendanceUserRef & { staff_code: string | null };
    status: AttendanceStatus;
    check_in_at: string | null;
    check_out_at: string | null;
}

export interface MyAttendanceHistoryFilters {
    page: number;
    pageSize: number;
    from?: string;
    to?: string;
}

export interface ListAttendanceFilters extends MyAttendanceHistoryFilters {
    userId?: string;
}
