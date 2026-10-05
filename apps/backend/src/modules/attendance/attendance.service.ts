import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { businessToday, isWeeklyOff } from "../../common/dates";
import { Paginated } from "../../types";
import {
    AdminAttendanceRow, AttendanceRecordView, AttendanceStatus,
    ListAttendanceFilters, MyAttendanceHistoryFilters, RosterEntry,
} from "./attendance.types";

/** PostgREST gives a 1:1 embed as an object or a one-element array. */
function one<T>(value: unknown): T | null {
    if (!value) return null;
    return (Array.isArray(value) ? (value[0] ?? null) : value) as T | null;
}

function toRecordView(row: { id: string; work_date: string; check_in_at: string | null; check_out_at: string | null }): AttendanceRecordView {
    return { id: row.id, work_date: row.work_date, check_in_at: row.check_in_at, check_out_at: row.check_out_at };
}

// ---------------------------------------------------------------------------
// Self-service — every function here is keyed on a userId that MUST come
// from req.user!.id in the controller, never a client-supplied param/query.
// ---------------------------------------------------------------------------

/** Find-or-create today's row, then stamp check_in_at. One check-in per business day. */
export async function checkIn(userId: string): Promise<AttendanceRecordView> {
    const workDate = businessToday();

    const { data: existing, error: readError } = await supabaseAdmin
        .from("attendance_records")
        .select("id, work_date, check_in_at, check_out_at")
        .eq("user_id", userId)
        .eq("work_date", workDate)
        .maybeSingle();
    if (readError) throw readError;
    if (existing?.check_in_at) throw businessRule("Already checked in today.");

    const now = new Date().toISOString();
    const { data, error } = existing
        ? await supabaseAdmin
            .from("attendance_records")
            .update({ check_in_at: now })
            .eq("id", existing.id)
            .select("id, work_date, check_in_at, check_out_at")
            .single()
        : await supabaseAdmin
            .from("attendance_records")
            .insert({ user_id: userId, work_date: workDate, check_in_at: now })
            .select("id, work_date, check_in_at, check_out_at")
            .single();
    if (error) throw error;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "attendance.checked_in",
        entityType: "attendance_record",
        entityId: data.id,
        after: { work_date: workDate, check_in_at: now },
    });

    return toRecordView(data);
}

/** Requires today's row to already have a check-in and no check-out yet. */
export async function checkOut(userId: string): Promise<AttendanceRecordView> {
    const workDate = businessToday();

    const { data: existing, error: readError } = await supabaseAdmin
        .from("attendance_records")
        .select("id, work_date, check_in_at, check_out_at")
        .eq("user_id", userId)
        .eq("work_date", workDate)
        .maybeSingle();
    if (readError) throw readError;
    if (!existing?.check_in_at) throw businessRule("You haven't checked in today yet.");
    if (existing.check_out_at) throw businessRule("Already checked out today.");

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
        .from("attendance_records")
        .update({ check_out_at: now })
        .eq("id", existing.id)
        .select("id, work_date, check_in_at, check_out_at")
        .single();
    if (error) throw error;

    await writeAudit({
        actorId: userId,
        targetUserId: userId,
        action: "attendance.checked_out",
        entityType: "attendance_record",
        entityId: data.id,
        after: { work_date: workDate, check_out_at: now },
    });

    return toRecordView(data);
}

export async function getMyToday(userId: string): Promise<AttendanceRecordView | null> {
    const { data, error } = await supabaseAdmin
        .from("attendance_records")
        .select("id, work_date, check_in_at, check_out_at")
        .eq("user_id", userId)
        .eq("work_date", businessToday())
        .maybeSingle();
    if (error) throw error;
    return data ? toRecordView(data) : null;
}

export async function getMyHistory(
    userId: string,
    filters: MyAttendanceHistoryFilters,
): Promise<Paginated<AttendanceRecordView>> {
    let query = supabaseAdmin
        .from("attendance_records")
        .select("id, work_date, check_in_at, check_out_at", { count: "exact" })
        .eq("user_id", userId);

    if (filters.from) query = query.gte("work_date", filters.from);
    if (filters.to) query = query.lte("work_date", filters.to);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("work_date", { ascending: false })
        .range(from, to);
    if (error) throw error;

    return paginate((data ?? []).map(toRecordView), count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Admin/staff — fleet-wide
// ---------------------------------------------------------------------------

interface RosterUserRow {
    id: string;
    full_name: string;
    staff_profiles: unknown;
}

/**
 * Active STAFF roster for today (role = 'staff' only — admin manages
 * attendance, they aren't tracked by it), with status derived (not stored) —
 * present = checked in today, on_leave = an approved leave covers today,
 * absent = neither. This is the query backing both the admin Attendance
 * page's default view and the dashboard's Present/Absent/On Leave stat cards
 * (via reports.service.ts's attendanceAndLeaveStats(), which mirrors this
 * same three-query shape rather than calling into this module).
 */
export async function getTodayRoster(): Promise<RosterEntry[]> {
    const today = businessToday();

    const { data: roster, error: rosterError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, staff_profiles(staff_code)")
        .eq("role", "staff")
        .eq("status", "active")
        .is("deleted_at", null);
    if (rosterError) throw rosterError;

    const rows = (roster ?? []) as unknown as RosterUserRow[];
    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.id);

    const [attendanceRes, leaveRes] = await Promise.all([
        supabaseAdmin
            .from("attendance_records")
            .select("user_id, check_in_at, check_out_at")
            .eq("work_date", today)
            .in("user_id", userIds),
        supabaseAdmin
            .from("leave_requests")
            .select("user_id")
            .eq("status", "approved")
            .lte("start_date", today)
            .gte("end_date", today)
            .in("user_id", userIds),
    ]);
    if (attendanceRes.error) throw attendanceRes.error;
    if (leaveRes.error) throw leaveRes.error;

    const attendanceByUser = new Map(
        (attendanceRes.data ?? []).map((a) => [a.user_id, a]),
    );
    const onLeaveUsers = new Set((leaveRes.data ?? []).map((l) => l.user_id));
    const weeklyOff = isWeeklyOff(today);

    return rows.map((r) => {
        const staff = one<{ staff_code: string | null }>(r.staff_profiles);
        const attendance = attendanceByUser.get(r.id);
        // on_leave beats everything (an approved leave is a deliberate,
        // reviewed absence). present beats week_off — someone who actually
        // checked in on a Sunday worked, whatever the calendar says.
        const status: AttendanceStatus = onLeaveUsers.has(r.id)
            ? "on_leave"
            : attendance?.check_in_at
                ? "present"
                : weeklyOff
                    ? "week_off"
                    : "absent";
        return {
            user: { id: r.id, full_name: r.full_name, staff_code: staff?.staff_code ?? null },
            status,
            check_in_at: attendance?.check_in_at ?? null,
            check_out_at: attendance?.check_out_at ?? null,
        };
    });
}

export async function listAttendance(filters: ListAttendanceFilters): Promise<Paginated<AdminAttendanceRow>> {
    let query = supabaseAdmin
        .from("attendance_records")
        .select("id, work_date, check_in_at, check_out_at, user:users!user_id(id, full_name)", { count: "exact" });

    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.from) query = query.gte("work_date", filters.from);
    if (filters.to) query = query.lte("work_date", filters.to);

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order("work_date", { ascending: false })
        .range(from, to);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
        id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; user: unknown;
    }>;

    const items: AdminAttendanceRow[] = rows.map((r) => {
        const user = one<{ id: string; full_name: string }>(r.user);
        if (!user) throw notFound("Attendance record references a missing user.");
        return { ...toRecordView(r), user };
    });

    return paginate(items, count ?? 0, filters);
}
