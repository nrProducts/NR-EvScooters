export type MaintenanceStatus = "reported" | "in_progress" | "resolved" | "cancelled";
export const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = [
    "reported", "in_progress", "resolved", "cancelled",
] as const;

export interface MaintenanceView {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    vehicle: { id: string; name: string; registration_number: string } | null;
}

/** Admin/staff view — same row, plus who reported it. */
export interface AdminMaintenanceRow extends MaintenanceView {
    reported_by: { id: string; full_name: string } | null;
}

export interface ListMaintenanceFilters {
    page: number;
    pageSize: number;
    status?: MaintenanceStatus;
    vehicleId?: string;
}

export interface CreateMaintenanceInput {
    vehicle_id: string;
    description: string;
    status?: MaintenanceStatus;
}

export interface UpdateMaintenanceInput {
    status?: MaintenanceStatus;
    description?: string;
}
