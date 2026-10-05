import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { businessToday, datesBetween, isWeeklyOff } from "../../common/dates";
import { getHolidayMapInRange } from "../holidays/holidays.service";
import { AuthContext, Paginated } from "../../types";
import {
    AdminLeaveRow, ApplyLeaveInput, LeaveBalance, LeaveDayBreakdown, LeavePreview, LeaveRequestStatus,
    LeaveRequestView, LeaveType, ListLeaveFilters, MyLeaveFilters,
} from "./leave.types";

/** PostgREST gives a 1:1 embed as an object or a one-element array. */
function one<T>(value: unknown): T | null {
    if (!value) return null;
    return (Array.isArray(value) ? (value[0] ?? null) : value) as T | null;
}

/**
 * Leave-calculation priority, pure and DB-free so it's directly unit
 * testable (see tests/leaveCalculation.test.ts): for every date in the
 * requested range, a government holiday wins over the weekly off, which wins
 * over an ordinary working day. Only "leave" kind dates are deducted from the
 * employee's balance — Sunday and holidays are skipped automatically, never
 * manually removed by the staff/admin applying.
 */
export function classifyDateRangeWithHolidays(
    startDate: string,
    endDate: string,
    holidayMap: ReadonlyMap<string, string>,
): LeaveDayBreakdown[] {
    return datesBetween(startDate, endDate).map((date) => {
        const holidayName = holidayMap.get(date);
        if (holidayName) return { date, kind: "holiday" as const, holiday_name: holidayName };
        if (isWeeklyOff(date)) return { date, kind: "week_off" as const };
        return { date, kind: "leave" as const };
    });
}

async function classifyDateRange(startDate: string, endDate: string): Promise<LeaveDayBreakdown[]> {
    const holidayMap = await getHolidayMapInRange(startDate, endDate);
    return classifyDateRangeWithHolidays(startDate, endDate, holidayMap);
}

function countLeaveDays(breakdown: LeaveDayBreakdown[]): number {
    return breakdown.filter((d) => d.kind === "leave").length;
}

/**
 * Every date within [startDate, endDate] that already falls inside a
 * pending/approved request of this user's — not just whether one overlaps,
 * but which exact dates, so the preview can mark each one "Already Applied"
 * rather than a single generic warning. Shared by applyForLeave (hard block)
 * and previewMyLeave (a heads-up before the staff member submits) — the
 * backend is the only enforcement point either way; the preview is a
 * courtesy, not the gate.
 */
async function getOverlappingDates(userId: string, startDate: string, endDate: string): Promise<Set<string>> {
    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select("start_date, end_date")
        .eq("user_id", userId)
        .in("status", ["pending", "approved"])
        .lte("start_date", endDate)
        .gte("end_date", startDate);
    if (error) throw error;

    const overlapping = new Set<string>();
    for (const row of data ?? []) {
        const clampedStart = row.start_date > startDate ? row.start_date : startDate;
        const clampedEnd = row.end_date < endDate ? row.end_date : endDate;
        for (const date of datesBetween(clampedStart, clampedEnd)) overlapping.add(date);
    }
    return overlapping;
}

function currentYearRange(): [string, string] {
    const year = businessToday().slice(0, 4);
    return [`${year}-01-01`, `${year}-12-31`];
}

interface RawLeaveRow {
    id: string;
    start_date: string;
    end_date: string;
    days: number;
    reason: string | null;
    status: LeaveRequestStatus;
    review_note: string | null;
    reviewed_at: string | null;
    created_at: string;
    leave_types: unknown;
}

function toLeaveType(raw: unknown): LeaveType {
    const t = one<{ id: string; code: string; name: string; annual_quota_days: number }>(raw);
    if (!t) throw notFound("Leave type not found.");
    return { id: t.id, code: t.code, name: t.name, annual_quota_days: t.annual_quota_days };
}

function toRequestView(row: RawLeaveRow): LeaveRequestView {
    return {
        id: row.id,
        leave_type: toLeaveType(row.leave_types),
        start_date: row.start_date,
        end_date: row.end_date,
        days: row.days,
        reason: row.reason,
        status: row.status,
        review_note: row.review_note,
        reviewed_at: row.reviewed_at,
        created_at: row.created_at,
    };
}

const LEAVE_SELECT = "id, start_date, end_date, days, reason, status, review_note, reviewed_at, created_at, leave_types(id, code, name, annual_quota_days)";

// ---------------------------------------------------------------------------
// Types + balance
// ---------------------------------------------------------------------------

export async function listLeaveTypes(): Promise<LeaveType[]> {
    const { data, error } = await supabaseAdmin
        .from("leave_types")
        .select("id, code, name, annual_quota_days")
        .eq("is_active", true)
        .order("name");
    if (error) throw error;
    return data ?? [];
}

/**
 * Remaining balance per active leave type for the current calendar year.
 *
 * Simplification, deliberate: a request spanning a year boundary counts its
 * full day-count toward its start_date's year — splitting it across two
 * years' quotas was not asked for and adds real complexity for an edge case
 * this app's short leave types (12/8 days) make rare.
 */
export async function getMyBalance(userId: string): Promise<LeaveBalance[]> {
    const types = await listLeaveTypes();
    if (types.length === 0) return [];

    const [yearStart, yearEnd] = currentYearRange();
    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select("leave_type_id, days")
        .eq("user_id", userId)
        .eq("status", "approved")
        .gte("start_date", yearStart)
        .lte("start_date", yearEnd);
    if (error) throw error;

    const usedByType = new Map<string, number>();
    for (const row of data ?? []) {
        usedByType.set(row.leave_type_id, (usedByType.get(row.leave_type_id) ?? 0) + Number(row.days));
    }

    return types.map((t) => {
        const used = usedByType.get(t.id) ?? 0;
        return { ...t, used_days: used, remaining_days: Math.max(0, t.annual_quota_days - used) };
    });
}

// ---------------------------------------------------------------------------
// Self-service — every function here is keyed on a userId that MUST come
// from req.user!.id in the controller, never a client-supplied param/query.
// ---------------------------------------------------------------------------

/**
 * The date-by-date preview shown before final submission: which selected
 * dates count as Leave vs. Week Off vs. Holiday, and whether the range
 * already collides with an existing request. Read-only — applyForLeave
 * re-derives everything itself rather than trusting this response, since a
 * client could call POST /leave/me directly without ever previewing.
 */
export async function previewMyLeave(userId: string, startDate: string, endDate: string): Promise<LeavePreview> {
    if (endDate < startDate) throw businessRule("End date must be on or after the start date.");

    const [breakdown, overlappingDates] = await Promise.all([
        classifyDateRange(startDate, endDate),
        getOverlappingDates(userId, startDate, endDate),
    ]);

    const days = breakdown.map((d) => (overlappingDates.has(d.date) ? { ...d, already_applied: true } : d));
    return { days, leave_day_count: countLeaveDays(days), has_overlap: overlappingDates.size > 0 };
}

export async function applyForLeave(userId: string, input: ApplyLeaveInput): Promise<LeaveRequestView> {
    const { data: typeRow, error: typeError } = await supabaseAdmin
        .from("leave_types")
        .select("id, code, name, annual_quota_days")
        .eq("id", input.leave_type_id)
        .eq("is_active", true)
        .maybeSingle();
    if (typeError) throw typeError;
    if (!typeRow) throw notFound("Leave type not found.");

    // Priority: government holiday, then the weekly off, then ordinary
    // working days — see classifyDateRangeWithHolidays(). Only "leave" kind
    // dates are deducted; Sunday and holidays are skipped automatically.
    const breakdown = await classifyDateRange(input.start_date, input.end_date);
    const days = countLeaveDays(breakdown);
    if (days <= 0) {
        throw businessRule("Every date in this range is a week off or a government holiday — there are no working days to apply leave for.");
    }

    // Overlap guard, checked on the full calendar range (not just the
    // working days) — without this the quota check below is unreliable,
    // since two overlapping requests would each count their own day-span
    // against the same calendar days. Enforced here regardless of what the
    // preview endpoint showed the client, so a direct API call cannot bypass
    // it by skipping the preview step.
    const overlappingDates = await getOverlappingDates(userId, input.start_date, input.end_date);
    if (overlappingDates.size > 0) {
        throw businessRule("Leave has already been applied for one or more selected dates.");
    }

    const balance = await getMyBalance(userId);
    const forType = balance.find((b) => b.id === typeRow.id);
    const remaining = forType?.remaining_days ?? typeRow.annual_quota_days;
    if (days > remaining) {
        throw businessRule(
            `This would exceed your remaining ${typeRow.name} balance (${remaining} day${remaining === 1 ? "" : "s"} left).`,
        );
    }

    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .insert({
            user_id: userId,
            leave_type_id: input.leave_type_id,
            start_date: input.start_date,
            end_date: input.end_date,
            days,
            reason: input.reason ?? null,
            status: "pending",
        })
        .select(LEAVE_SELECT)
        .single();
    if (error) throw error;

    const view = toRequestView(data as unknown as RawLeaveRow);

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "leave.applied",
        entityType: "leave_request",
        entityId: view.id,
        after: { leave_type_id: input.leave_type_id, start_date: input.start_date, end_date: input.end_date, days },
    });

    return view;
}

export async function getMyLeaveRequests(userId: string, filters: MyLeaveFilters): Promise<Paginated<LeaveRequestView>> {
    let query = supabaseAdmin
        .from("leave_requests")
        .select(LEAVE_SELECT, { count: "exact" })
        .eq("user_id", userId);

    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawLeaveRow[];
    return paginate(rows.map(toRequestView), count ?? 0, filters);
}

/**
 * Re-checks ownership itself rather than trusting the route shape — defense
 * in depth, same reasoning as this codebase's other per-row ownership checks.
 */
export async function cancelMyLeaveRequest(userId: string, id: string): Promise<LeaveRequestView> {
    const { data: row, error: readError } = await supabaseAdmin
        .from("leave_requests")
        .select("id, user_id, status")
        .eq("id", id)
        .maybeSingle();
    if (readError) throw readError;
    if (!row || row.user_id !== userId) throw notFound("Leave request not found.");
    if (row.status !== "pending") throw businessRule("Only a pending leave request can be cancelled.");

    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .update({ status: "cancelled" })
        .eq("id", id)
        .select(LEAVE_SELECT)
        .single();
    if (error) throw error;

    const view = toRequestView(data as unknown as RawLeaveRow);

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "leave.cancelled",
        entityType: "leave_request",
        entityId: id,
    });

    return view;
}

// ---------------------------------------------------------------------------
// Admin/staff — fleet-wide
// ---------------------------------------------------------------------------

export async function listLeaveRequests(filters: ListLeaveFilters): Promise<Paginated<AdminLeaveRow>> {
    let query = supabaseAdmin
        .from("leave_requests")
        .select(
            `${LEAVE_SELECT}, user:users!user_id(id, full_name), reviewed_by_user:users!reviewed_by(id, full_name)`,
            { count: "exact" },
        );

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.leaveTypeId) query = query.eq("leave_type_id", filters.leaveTypeId);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<RawLeaveRow & { user: unknown; reviewed_by_user: unknown }>;
    const items: AdminLeaveRow[] = rows.map((r) => {
        const user = one<{ id: string; full_name: string }>(r.user);
        if (!user) throw notFound("Leave request references a missing user.");
        return {
            ...toRequestView(r),
            user,
            reviewed_by: one<{ id: string; full_name: string }>(r.reviewed_by_user),
        };
    });

    return paginate(items, count ?? 0, filters);
}

async function requireReviewablePending(id: string): Promise<{ id: string; user_id: string }> {
    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select("id, user_id, status")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Leave request not found.");
    if (data.status !== "pending") throw businessRule("This leave request has already been reviewed.");
    return data;
}

export async function approveLeaveRequest(id: string, actor: AuthContext, note?: string): Promise<AdminLeaveRow> {
    const target = await requireReviewablePending(id);

    const { error } = await supabaseAdmin
        .from("leave_requests")
        .update({ status: "approved", reviewed_by: actor.id, review_note: note ?? null, reviewed_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: target.user_id,
        action: "leave.approved",
        entityType: "leave_request",
        entityId: id,
        after: { review_note: note ?? null },
    });

    return readAdminRow(id);
}

export async function rejectLeaveRequest(id: string, actor: AuthContext, note: string): Promise<AdminLeaveRow> {
    const target = await requireReviewablePending(id);

    const { error } = await supabaseAdmin
        .from("leave_requests")
        .update({ status: "rejected", reviewed_by: actor.id, review_note: note, reviewed_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: target.user_id,
        action: "leave.rejected",
        entityType: "leave_request",
        entityId: id,
        after: { review_note: note },
    });

    return readAdminRow(id);
}

async function readAdminRow(id: string): Promise<AdminLeaveRow> {
    const { data, error } = await supabaseAdmin
        .from("leave_requests")
        .select(
            `${LEAVE_SELECT}, user:users!user_id(id, full_name), reviewed_by_user:users!reviewed_by(id, full_name)`,
        )
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Leave request not found.");

    const row = data as unknown as RawLeaveRow & { user: unknown; reviewed_by_user: unknown };
    const user = one<{ id: string; full_name: string }>(row.user);
    if (!user) throw notFound("Leave request references a missing user.");

    return { ...toRequestView(row), user, reviewed_by: one<{ id: string; full_name: string }>(row.reviewed_by_user) };
}
