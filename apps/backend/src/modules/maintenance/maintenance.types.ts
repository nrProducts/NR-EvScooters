/** `triaged` is new: the gap between reporting and starting work is real. */
export type MaintenanceStatus =
    "reported" | "triaged" | "in_progress" | "resolved" | "cancelled";
export const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = [
    "reported", "triaged", "in_progress", "resolved", "cancelled",
] as const;

/**
 * Set once staff verify a displaced vehicle: quick_fix (same-day, no temp
 * vehicle) / standard_temp (rider gets a temp vehicle while original is
 * repaired) / not_repairable (scrapped, rider permanently reassigned). Null
 * until triaged — a plain "Report issue" ticket never gets one.
 */
export type MaintenanceOutcome =
    "quick_fix" | "temp_vehicle" | "replacement" | "not_repairable";
export const MAINTENANCE_OUTCOMES: readonly MaintenanceOutcome[] = [
    "quick_fix", "temp_vehicle", "replacement", "not_repairable",
] as const;

interface MaintenanceVehicleRef {
    id: string;
    name: string;
    registration_number: string;
}

/**
 * Was `MaintenanceVehicleRef` plus `battery_percentage`. Charge level is not a
 * vehicle column any more — nothing measured it, and it was a static 100 on
 * every row — so a temp vehicle reference is now just a vehicle reference.
 */
type MaintenanceTempVehicleRef = MaintenanceVehicleRef;

interface MaintenanceUserRef {
    id: string;
    full_name: string;
}

export interface MaintenanceView {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    outcome: MaintenanceOutcome | null;
    expected_ready_at: string | null;
    triaged_at: string | null;
    vehicle: MaintenanceVehicleRef | null;
    displaced_rider: MaintenanceUserRef | null;
    temp_vehicle: MaintenanceTempVehicleRef | null;
    replacement_vehicle: MaintenanceVehicleRef | null;
}

/** Admin/staff view — same row, plus who reported it and who triaged it. */
export interface AdminMaintenanceRow extends MaintenanceView {
    reported_by: MaintenanceUserRef | null;
    triaged_by: MaintenanceUserRef | null;
}

export interface ListMaintenanceFilters {
    page: number;
    pageSize: number;
    status?: MaintenanceStatus;
    vehicleId?: string;
    sortBy: "created_at";
    sortDir: "asc" | "desc";
}

/**
 * The rider-facing equivalent. Identical fields, but the service applies an
 * ownership scope on top: only vehicles this rider rented, and only tickets
 * raised from their pickup onward.
 */
export type MyMaintenanceHistoryFilters = ListMaintenanceFilters;

export interface CreateMaintenanceInput {
    vehicle_id: string;
    description: string;
    status?: MaintenanceStatus;
}

export interface UpdateMaintenanceInput {
    status?: MaintenanceStatus;
    description?: string;
}

export interface QuickFixInput {
    expected_ready_at: string;
}

export interface AssignTempVehicleInput {
    temp_vehicle_id: string;
}

export interface NotRepairableInput {
    reason: string;
    estimated_value?: number;
    scrapped_on?: string;
}

export interface ReassignAfterScrapInput {
    replacement_vehicle_id: string;
}

/** What the rider's home screen renders — derived from their own open, displaced-by ticket, if any. */
export type MaintenanceNoticeStage = "pending_triage" | "quick_fix" | "temp_vehicle";

export interface MaintenanceNoticeView {
    ticket_id: string;
    stage: MaintenanceNoticeStage;
    expected_ready_at: string | null;
    temp_vehicle: MaintenanceTempVehicleRef | null;
}
