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
    /** Last 6 calendar months, oldest first. */
    trends: {
        revenue: Array<{ month: string; amount: number }>;
        bookings: Array<{ month: string; count: number }>;
        maintenance: Array<{ month: string; count: number }>;
    };
}
