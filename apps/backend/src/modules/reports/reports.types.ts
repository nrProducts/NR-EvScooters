import { KycStatus } from "../../types";
import { VehicleStatus } from "../vehicles/vehicles.types";
import { MaintenanceStatus } from "../maintenance/maintenance.types";

export interface ReportsSummary {
    vehicles: {
        total: number;
        by_status: Record<VehicleStatus, number>;
    };
    riders: {
        total: number;
        by_kyc_status: Record<KycStatus, number>;
    };
    revenue: {
        paid_total: number;
        pending_total: number;
        pending_count: number;
        refunded_total: number;
        invoice_count: number;
    };
    maintenance: {
        by_status: Record<MaintenanceStatus, number>;
    };
    plans: {
        active_subscriptions: number;
    };
    bookings: {
        pending_count: number;
    };
    rides: {
        active_count: number;
    };
    /**
     * Mini HRMS — active staff roster (role='staff' only, admin excluded —
     * see attendance.service.ts's getTodayRoster()), today's derived status
     * counts. total_staff = present + absent + on_leave + on_week_off.
     */
    attendance: {
        total_staff: number;
        present_today: number;
        absent_today: number;
        on_leave_today: number;
        /** Sunday, no check-in. See common/dates.ts's isWeeklyOff(). */
        on_week_off_today: number;
    };
    leave: {
        pending_count: number;
        approved_count: number;
        rejected_count: number;
    };
    /** Last 6 calendar months, oldest first. */
    trends: {
        revenue: Array<{ month: string; amount: number }>;
        bookings: Array<{ month: string; count: number }>;
        maintenance: Array<{ month: string; count: number }>;
    };
}

/**
 * The header's "Pending Approvals" bell — everything currently awaiting an
 * admin decision, across every module, in one cheap call (count-only queries,
 * no rows, no trends). Deliberately separate from ReportsSummary: that one's
 * heavy (6 months of trend data) and is only ever fetched on the Dashboard
 * page; this is fetched on every admin screen, so it stays lean.
 */
export interface PendingApprovalsSummary {
    kyc_pending: number;
    returns_pending: number;
    support_open: number;
    maintenance_pending: number;
    refunds_pending: number;
    leave_pending: number;
    /** Paid, confirmed bookings still waiting on staff to confirm the physical pickup. */
    bookings_awaiting_pickup: number;
}
