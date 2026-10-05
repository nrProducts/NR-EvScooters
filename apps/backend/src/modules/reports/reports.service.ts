import { supabaseAdmin } from "../../config/supabase";
import { KYC_STATUSES, KycStatus } from "../../types";
import { VEHICLE_STATUSES, VehicleStatus } from "../vehicles/vehicles.types";
import { MAINTENANCE_STATUSES, MaintenanceStatus } from "../maintenance/maintenance.types";
import { businessToday, isWeeklyOff } from "../../common/dates";
import { PendingApprovalsSummary, ReportsSummary } from "./reports.types";

function zeroed<T extends string>(keys: readonly T[]): Record<T, number> {
    return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

async function vehicleStatusCounts(): Promise<Record<VehicleStatus, number>> {
    const { data, error } = await supabaseAdmin.from("vehicles").select("status");
    if (error) throw error;
    const counts = zeroed(VEHICLE_STATUSES);
    for (const row of data ?? []) counts[row.status] += 1;
    return counts;
}

async function maintenanceStatusCounts(): Promise<Record<MaintenanceStatus, number>> {
    const { data, error } = await supabaseAdmin.from("maintenance_tickets").select("status");
    if (error) throw error;
    const counts = zeroed(MAINTENANCE_STATUSES);
    for (const row of data ?? []) counts[row.status] += 1;
    return counts;
}

/**
 * Riders and their KYC spread.
 *
 * Three queries became one: the role is a column on `users` rather than a
 * `roles` lookup joined through `user_roles`, and `kyc_status` is embedded
 * from `rider_profiles`. `!inner` is what keeps this to riders who actually
 * have a profile row.
 */
async function riderStats(): Promise<{ total: number; by_kyc_status: Record<KycStatus, number> }> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id, rider_profiles!inner(kyc_status)")
        .eq("role", "rider")
        .is("deleted_at", null);
    if (error) throw error;

    const by_kyc_status = zeroed(KYC_STATUSES);
    for (const row of data ?? []) {
        // PostgREST types a 1:1 embed as an array here, so the element type
        // has to be narrowed by hand before it can index the record.
        const profile = (Array.isArray(row.rider_profiles) ? row.rider_profiles[0] : row.rider_profiles) as
            | { kyc_status: KycStatus }
            | undefined;
        if (profile) by_kyc_status[profile.kyc_status] += 1;
    }

    return { total: (data ?? []).length, by_kyc_status };
}

/**
 * Revenue.
 *
 * `invoices` no longer carries `amount_due` or `payment_status`: an invoice's
 * paid-ness is the sum of its `payment_allocations` against its total, which
 * is what `v_invoice_balances` computes. Reading a status column was always a
 * bet that some other code kept it honest.
 *
 * The `refunded_total` bucket therefore changes meaning slightly. There was a
 * `payment_status = 'refunded'` state; there is no such invoice state now,
 * because refunding does not un-issue an invoice. It is read from `refunds`
 * instead, which is where the money actually went.
 */
async function revenueSummary(): Promise<ReportsSummary["revenue"]> {
    const [balancesRes, refundsRes] = await Promise.all([
        supabaseAdmin
            .from("v_invoice_balances")
            .select("total_amount, balance_amount, is_paid, status"),
        supabaseAdmin.from("refunds").select("amount").eq("status", "succeeded"),
    ]);
    if (balancesRes.error) throw balancesRes.error;
    if (refundsRes.error) throw refundsRes.error;

    let paid_total = 0;
    let pending_total = 0;
    let pending_count = 0;

    const rows = balancesRes.data ?? [];
    for (const row of rows) {
        // A voided invoice is not revenue and not owed.
        if (row.status === "void") continue;
        if (row.is_paid) {
            paid_total += Number(row.total_amount ?? 0);
        } else {
            // What is outstanding is the BALANCE, not the total: a partly-paid
            // invoice would otherwise be counted at full value in both buckets.
            pending_total += Number(row.balance_amount ?? 0);
            pending_count += 1;
        }
    }

    const refunded_total = (refundsRes.data ?? []).reduce((sum, r) => sum + Number(r.amount), 0);

    return { paid_total, pending_total, pending_count, refunded_total, invoice_count: rows.length };
}

async function activeSubscriptionCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
    if (error) throw error;
    return count ?? 0;
}

async function pendingBookingCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending_payment");
    if (error) throw error;
    return count ?? 0;
}

async function activeRideCount(): Promise<number> {
    const { count, error } = await supabaseAdmin
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("status", "active");
    if (error) throw error;
    return count ?? 0;
}

/**
 * Mini HRMS dashboard stats. Roster is role = 'staff' only, same as
 * attendance.service.ts's getTodayRoster() — admin manages attendance, they
 * aren't tracked by it, so an admin account must never inflate Total Staff
 * or appear as present/absent. Also mirrors that function's exact
 * status-derivation precedence (on_leave wins over present, so nobody is
 * double-counted across both buckets) — fetches the id sets rather than two
 * independent `head:true` counts, specifically so that precedence can be
 * applied here too.
 */
async function attendanceAndLeaveStats(): Promise<{
    attendance: ReportsSummary["attendance"];
    leave: ReportsSummary["leave"];
}> {
    const today = businessToday();

    const [rosterRes, leaveStatusRes] = await Promise.all([
        supabaseAdmin
            .from("users")
            .select("id")
            .eq("role", "staff")
            .eq("status", "active")
            .is("deleted_at", null),
        supabaseAdmin.from("leave_requests").select("status"),
    ]);
    if (rosterRes.error) throw rosterRes.error;
    if (leaveStatusRes.error) throw leaveStatusRes.error;

    const leaveCounts = { pending_count: 0, approved_count: 0, rejected_count: 0 };
    for (const row of leaveStatusRes.data ?? []) {
        if (row.status === "pending") leaveCounts.pending_count += 1;
        else if (row.status === "approved") leaveCounts.approved_count += 1;
        else if (row.status === "rejected") leaveCounts.rejected_count += 1;
    }

    const userIds = (rosterRes.data ?? []).map((r) => r.id);
    const totalStaff = userIds.length;

    if (totalStaff === 0) {
        return {
            attendance: { total_staff: 0, present_today: 0, absent_today: 0, on_leave_today: 0, on_week_off_today: 0 },
            leave: leaveCounts,
        };
    }

    const [attendanceRes, leaveRes] = await Promise.all([
        supabaseAdmin
            .from("attendance_records")
            .select("user_id, check_in_at")
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

    const onLeaveUsers = new Set((leaveRes.data ?? []).map((l) => l.user_id));
    const checkedInUsers = new Set(
        (attendanceRes.data ?? []).filter((a) => a.check_in_at).map((a) => a.user_id),
    );

    let presentToday = 0;
    let onLeaveToday = 0;
    for (const id of userIds) {
        if (onLeaveUsers.has(id)) onLeaveToday += 1;
        else if (checkedInUsers.has(id)) presentToday += 1;
    }
    // Sunday: whoever isn't present/on_leave is on the weekly off, not
    // absent — same precedence as getTodayRoster()'s per-user derivation.
    const remaining = totalStaff - presentToday - onLeaveToday;
    const weeklyOff = isWeeklyOff(today);
    const onWeekOffToday = weeklyOff ? remaining : 0;
    const absentToday = weeklyOff ? 0 : remaining;

    return {
        attendance: {
            total_staff: totalStaff, present_today: presentToday, absent_today: absentToday,
            on_leave_today: onLeaveToday, on_week_off_today: onWeekOffToday,
        },
        leave: leaveCounts,
    };
}

/** YYYY-MM for the current month and the (n-1) before it, oldest first. */
function lastNMonths(n: number): string[] {
    const out: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < n; i++) {
        out.unshift(d.toISOString().slice(0, 7));
        d.setMonth(d.getMonth() - 1);
    }
    return out;
}

/**
 * Revenue by month.
 *
 * `invoices.paid_at` is gone with `payment_status`, so the month a payment
 * belongs to comes from the payment itself — `payment_transactions.created_at`
 * via `payment_allocations`. That is more accurate than the old column: an
 * invoice settled by two payments in different months now contributes to both,
 * where a single `paid_at` could only name one.
 */
async function revenueTrend(months: string[]): Promise<ReportsSummary["trends"]["revenue"]> {
    const { data, error } = await supabaseAdmin
        .from("payment_allocations")
        .select("amount, payment_transactions!inner(created_at, status)")
        .eq("payment_transactions.status", "succeeded")
        .gte("payment_transactions.created_at", `${months[0]}-01`);
    if (error) throw error;

    const buckets = new Map(months.map((m) => [m, 0]));
    for (const row of data ?? []) {
        const txn = Array.isArray(row.payment_transactions)
            ? row.payment_transactions[0]
            : row.payment_transactions;
        if (!txn?.created_at) continue;
        const key = txn.created_at.slice(0, 7);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + Number(row.amount));
    }
    return months.map((month) => ({ month, amount: buckets.get(month) ?? 0 }));
}

async function bookingsTrend(months: string[]): Promise<ReportsSummary["trends"]["bookings"]> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("created_at")
        .gte("created_at", `${months[0]}-01`);
    if (error) throw error;

    const buckets = new Map(months.map((m) => [m, 0]));
    for (const row of data ?? []) {
        const key = row.created_at.slice(0, 7);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return months.map((month) => ({ month, count: buckets.get(month) ?? 0 }));
}

async function maintenanceTrend(months: string[]): Promise<ReportsSummary["trends"]["maintenance"]> {
    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("created_at")
        .gte("created_at", `${months[0]}-01`);
    if (error) throw error;

    const buckets = new Map(months.map((m) => [m, 0]));
    for (const row of data ?? []) {
        const key = row.created_at.slice(0, 7);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return months.map((month) => ({ month, count: buckets.get(month) ?? 0 }));
}

/**
 * Single aggregate endpoint backing the Reports page and Admin Dashboard.
 * Fetches unpaginated status/amount columns and counts them in memory — fine
 * at this app's current scale; worth revisiting with real SQL aggregates once
 * the fleet/rider counts grow large.
 *
 * Per-repair maintenance cost is now available (`maintenance_tickets.cost_amount`,
 * which the old `vehicle_maintenance` lacked) but is not reported here — adding
 * it is a new figure on the page, not schema breakage.
 */
export async function getReportsSummary(): Promise<ReportsSummary> {
    const months = lastNMonths(6);
    const [
        vehicleStatus, riders, revenue, maintenanceStatus, activeSubscriptions, pendingBookings, activeRides,
        revenueTrendData, bookingsTrendData, maintenanceTrendData, hrmsStats,
    ] = await Promise.all([
        vehicleStatusCounts(),
        riderStats(),
        revenueSummary(),
        maintenanceStatusCounts(),
        activeSubscriptionCount(),
        pendingBookingCount(),
        activeRideCount(),
        revenueTrend(months),
        bookingsTrend(months),
        maintenanceTrend(months),
        attendanceAndLeaveStats(),
    ]);

    return {
        vehicles: {
            total: Object.values(vehicleStatus).reduce((a, b) => a + b, 0),
            by_status: vehicleStatus,
        },
        riders,
        revenue,
        maintenance: { by_status: maintenanceStatus },
        plans: { active_subscriptions: activeSubscriptions },
        bookings: { pending_count: pendingBookings },
        rides: { active_count: activeRides },
        attendance: hrmsStats.attendance,
        leave: hrmsStats.leave,
        trends: { revenue: revenueTrendData, bookings: bookingsTrendData, maintenance: maintenanceTrendData },
    };
}

/**
 * Everything currently awaiting an admin decision, fleet-wide — the header's
 * "Pending Approvals" bell. Six count-only queries, no row data, no trends:
 * this is fetched on every admin screen (unlike getReportsSummary, which is
 * Dashboard-only), so it has to stay cheap.
 */
export async function getPendingApprovals(): Promise<PendingApprovalsSummary> {
    const [
        kycPending, returnsPending, supportOpen, maintenanceCounts, refundsPending, leaveCounts, bookingsAwaitingPickup,
        signupsPending,
    ] = await Promise.all([
        supabaseAdmin
            .from("users")
            .select("id, rider_profiles!inner(kyc_status)", { count: "exact", head: true })
            .eq("role", "rider")
            .is("deleted_at", null)
            .eq("rider_profiles.kyc_status", "pending"),
        supabaseAdmin
            .from("rental_returns")
            .select("rental_id", { count: "exact", head: true })
            .in("status", ["requested", "inspected"]),
        supabaseAdmin
            .from("support_tickets")
            .select("id", { count: "exact", head: true })
            .in("status", ["open", "in_progress"]),
        maintenanceStatusCounts(),
        supabaseAdmin
            .from("refunds")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        supabaseAdmin
            .from("leave_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending"),
        // A paid, confirmed booking still needs a staff member to physically
        // hand the vehicle over and tap "Confirm pickup" — exactly the
        // Bookings page's own "Pending Bookings" tab default filter
        // (bookings.service.ts's filtersForView("pending")). Distinct from
        // pendingBookingCount() above, which counts unpaid
        // 'pending_payment' bookings — a rider-side wait, not a staff task.
        supabaseAdmin
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "confirmed"),
        // Self-registered accounts an admin has not yet approved/rejected —
        // selfSignUpStaff() stamps this exact status_reason (Users → Awaiting
        // approval). Approving or rejecting replaces it.
        supabaseAdmin
            .from("users")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("status", "inactive")
            .ilike("status_reason", "%awaiting admin approval%"),
    ]);
    if (kycPending.error) throw kycPending.error;
    if (returnsPending.error) throw returnsPending.error;
    if (supportOpen.error) throw supportOpen.error;
    if (refundsPending.error) throw refundsPending.error;
    if (leaveCounts.error) throw leaveCounts.error;
    if (bookingsAwaitingPickup.error) throw bookingsAwaitingPickup.error;
    if (signupsPending.error) throw signupsPending.error;

    return {
        kyc_pending: kycPending.count ?? 0,
        returns_pending: returnsPending.count ?? 0,
        support_open: supportOpen.count ?? 0,
        maintenance_pending: maintenanceCounts.reported + maintenanceCounts.in_progress,
        refunds_pending: refundsPending.count ?? 0,
        leave_pending: leaveCounts.count ?? 0,
        bookings_awaiting_pickup: bookingsAwaitingPickup.count ?? 0,
        signups_pending: signupsPending.count ?? 0,
    };
}
