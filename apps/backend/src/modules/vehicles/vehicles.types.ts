export type VehicleStatus = "available" | "in_use" | "maintenance" | "retired";
export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
    "available", "in_use", "maintenance", "retired",
] as const;

export interface VehicleRow {
    id: string;
    name: string;
    registration_number: string;
    battery_number: string;
    manufacturer: string;
    model: string;
    vin: string;
    battery_percentage: number;
    status: VehicleStatus;
    last_service_date: string | null;
    next_service_due_date: string | null;
    active: boolean;
    created_at: string;
    updated_at: string | null;
}

export interface VehicleDocumentRow {
    id: string;
    doc_type: "registration" | "insurance";
    doc_number: string;
    issued_date: string;
    expiry_date: string;
}

export interface VehicleMaintenanceRow {
    id: string;
    status: "reported" | "in_progress" | "resolved" | "cancelled";
    description: string;
    resolved_at: string | null;
    created_at: string;
}

export interface VehicleRentalRow {
    id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    rider: { id: string; full_name: string } | null;
}

export interface VehicleDetail extends VehicleRow {
    documents: VehicleDocumentRow[];
    maintenance_history: VehicleMaintenanceRow[];
    rental_history: VehicleRentalRow[];
    /** The rider currently holding this vehicle, derived from the active rental (if any). */
    current_rider: { id: string; full_name: string } | null;
}

export interface ListVehiclesFilters {
    page: number;
    pageSize: number;
    search?: string;
    status?: VehicleStatus;
    sortBy: "created_at" | "name" | "battery_percentage" | "next_service_due_date";
    sortDir: "asc" | "desc";
}

export interface CreateVehicleInput {
    name: string;
    registration_number: string;
    battery_number: string;
    manufacturer: string;
    model: string;
    vin: string;
    battery_percentage?: number;
    status?: VehicleStatus;
    last_service_date?: string;
    next_service_due_date?: string;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;
