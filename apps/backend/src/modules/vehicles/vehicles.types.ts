/**
 * Matches the live public.vehicle_status enum after
 * 20260727095623_vehicle_status_lifecycle_enum.sql renamed 'in_use' ->
 * 'assigned', 'retired' -> 'scrap', and added 'booked' (a vehicle reserved
 * by a booking via allocate_vehicle_for_booking(), not yet handed over).
 */
export type VehicleStatus = "available" | "booked" | "assigned" | "maintenance" | "scrap";
export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
    "available", "booked", "assigned", "maintenance", "scrap",
] as const;

/**
 * Derived, not a vehicles column — the payment/billing state of whichever
 * booking currently holds this vehicle (status 'booked'/'assigned'). 'pending_payment'
 * and 'confirmed' mirror bookings.status for a rider who hasn't been picked
 * up yet; 'active'/'due'/'paused' mirror bookings.plan_status once the
 * rental is underway. null when no live booking holds the vehicle.
 */
export type VehiclePaymentStatus = "pending_payment" | "confirmed" | "active" | "due" | "paused" | null;

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
    color: string | null;
    qr_code: string | null;
    imei: string | null;
    purchase_date: string | null;
    insurance_number: string | null;
    insurance_expiry: string | null;
    created_at: string;
    updated_at: string | null;
    payment_status: VehiclePaymentStatus;
}

export interface VehiclePhotoRow {
    id: string;
    /** Signed URL, minted per request — never the raw storage path. */
    url: string;
    is_primary: boolean;
    sort_order: number;
    created_at: string;
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
    outcome: "quick_fix" | "standard_temp" | "not_repairable" | null;
    expected_ready_at: string | null;
    /** Set when outcome = standard_temp: the vehicle handed to the rider while this one was repaired. */
    temp_vehicle: { id: string; name: string; registration_number: string } | null;
}

export interface VehicleRentalRow {
    id: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    rider: { id: string; full_name: string } | null;
}

export interface ScrapRecordRow {
    id: string;
    reason: string;
    scrapped_on: string;
    estimated_value: number | null;
    approved_by: { id: string; full_name: string } | null;
    created_at: string;
}

export interface VehicleDetail extends VehicleRow {
    documents: VehicleDocumentRow[];
    photos: VehiclePhotoRow[];
    maintenance_history: VehicleMaintenanceRow[];
    rental_history: VehicleRentalRow[];
    /** The rider currently holding this vehicle, derived from the active rental (if any). */
    current_rider: { id: string; full_name: string } | null;
    /** Set only once this vehicle has been scrapped. */
    scrap_record: ScrapRecordRow | null;
}

export interface ScrapVehicleInput {
    reason: string;
    estimated_value?: number;
    scrapped_on?: string;
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
    color?: string;
    qr_code?: string;
    imei?: string;
    purchase_date?: string;
    insurance_number?: string;
    insurance_expiry?: string;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput>;
