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

interface LeaveUserRef {
    id: string;
    full_name: string;
}

export interface LeaveRequestView {
    id: string;
    leave_type: LeaveType;
    start_date: string;
    end_date: string;
    days: number;
    reason: string | null;
    status: LeaveRequestStatus;
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
}

/** Admin/staff view — same row, plus who it belongs to and who reviewed it. */
export interface AdminLeaveRow extends LeaveRequestView {
    user: LeaveUserRef;
    reviewed_by: LeaveUserRef | null;
}

export interface ApplyLeaveInput {
    leave_type_id: string;
    start_date: string;
    end_date: string;
    reason?: string;
}

export interface ReviewLeaveInput {
    review_note?: string;
}

export interface MyLeaveFilters {
    page: number;
    pageSize: number;
    status?: LeaveRequestStatus;
}

export interface ListLeaveFilters extends MyLeaveFilters {
    userId?: string;
    leaveTypeId?: string;
}

/** Why a given calendar date within a requested range does or doesn't count as a leave day. */
export type LeaveDayKind = "leave" | "week_off" | "holiday";

export interface LeaveDayBreakdown {
    date: string;
    kind: LeaveDayKind;
    /** Set only when kind === "holiday". */
    holiday_name?: string;
    /** True if this date already falls inside a pending/approved request of the caller's. */
    already_applied?: boolean;
}

/** Response for GET /leave/me/preview — shown to the staff member before they submit. */
export interface LeavePreview {
    days: LeaveDayBreakdown[];
    leave_day_count: number;
    /** True if any date in the range overlaps a pending/approved request of the caller's. */
    has_overlap: boolean;
}

export interface PreviewLeaveInput {
    start_date: string;
    end_date: string;
}
