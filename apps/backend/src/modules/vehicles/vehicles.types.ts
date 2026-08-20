/**
 * Matches `public.vehicle_status`.
 *
 * Two changes from the old enum: `booked` is `reserved`, and `scrap` is
 * `retired` — back to the name it had before the old project renamed it.
 *
 * More importantly, **this column is read-only now**. `recompute_vehicle_status()`
 * derives it from the vehicle's open maintenance ticket, its rental
 * assignment and its booking hold, and a trigger keeps it current. Nothing in
 * the application writes it; a write would be overwritten and, worse, would
 * disagree with the facts it is supposed to summarise.
 */
export type VehicleStatus = "available" | "reserved" | "assigned" | "maintenance" | "retired";
export const VEHICLE_STATUSES: readonly VehicleStatus[] = [
    "available", "reserved", "assigned", "maintenance", "retired",
] as const;

/**
 * Derived, not a vehicles column — the payment/billing state of whoever
 * currently holds this vehicle. `pending_payment` and `confirmed` mirror
 * `bookings.status` for a rider who has not been handed the scooter yet;
 * `active`/`past_due`/`paused` mirror `subscriptions.status` once the rental
 * is underway. Null when nothing live holds the vehicle.
 *
 * `due` was renamed `past_due` with the subscription split.
 */
export type VehiclePaymentStatus =
    | "pending_payment" | "confirmed" | "active" | "past_due" | "paused" | null;

export interface VehicleRow {
    id: string;
    /** `vehicles.display_name`, falling back to the model name. Was `name`. */
    name: string;
    registration_number: string;
    /** `vehicle_models.name`, via the model FK. Was a text column on the vehicle. */
    model: string;
    vehicle_model_id: string;
    vin: string;
    /** Read-only — see the note on VehicleStatus. */
    status: VehicleStatus;
    /** `vehicles.colour`. Note the spelling. */
    color: string | null;
    qr_code: string | null;
    imei: string | null;
    /** `vehicles.purchased_on`. Was `purchase_date`. */
    purchase_date: string | null;
    /** Which hub the vehicle belongs to. New; there was no such column. */
    hub_id: string | null;
    created_at: string;
    updated_at: string | null;
    payment_status: VehiclePaymentStatus;
}

export interface VehicleDocumentRow {
    id: string;
    /** Five types now, not two — `vehicle_document_type`. */
    doc_type: "registration" | "insurance" | "puc" | "fitness" | "permit";
    /** `vehicle_documents.document_number`. */
    doc_number: string;
    /** `vehicle_documents.issued_on`. */
    issued_date: string | null;
    /** `vehicle_documents.expires_on`. */
    expires_on: string;
}

export interface VehicleMaintenanceRow {
    id: string;
    /** `maintenance_status` gained a `triaged` state. */
    status: "reported" | "triaged" | "in_progress" | "resolved" | "cancelled";
    description: string;
    resolved_at: string | null;
    created_at: string;
    /** `maintenance_outcome`: `standard_temp` is now `temp_vehicle`, and `replacement` is new. */
    outcome: "quick_fix" | "temp_vehicle" | "replacement" | "not_repairable" | null;
    expected_ready_at: string | null;
    /**
     * The vehicle handed to the rider while this one was repaired.
     *
     * Read from `rental_vehicle_assignments` rows carrying this ticket's id,
     * not from a `temp_vehicle_id` column — the column is gone, because a
     * ticket can produce more than one handover (temp, then replacement).
     */
    temp_vehicle: { id: string; name: string; registration_number: string } | null;
}

export interface VehicleRentalRow {
    id: string;
    status: string;
    /** `rentals.picked_up_at`. Was `started_at`. */
    started_at: string;
    /** `rentals.returned_at`. Was `ended_at`. */
    ended_at: string | null;
    rider: { id: string; full_name: string } | null;
    /** From `rental_returns` — the workflow moved off the rentals row. */
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    /** `COALESCE(rental_returns.due_back_at, rentals.due_back_at)`. */
    return_due_at: string | null;
}

export interface VehicleBookingRow {
    id: string;
    status: string;
    /** `subscriptions.status` for the subscription this booking became, if any. */
    plan_status: "active" | "past_due" | "paused" | null;
    start_day: string;
    created_at: string;
    rider: { id: string; full_name: string } | null;
}

/** A row of `vehicle_disposals`. Was `scrap_records`. */
export interface ScrapRecordRow {
    reason: string;
    /** `vehicle_disposals.disposed_on`. */
    scrapped_on: string;
    /** `vehicle_disposals.salvage_amount`. Was `estimated_value`. */
    estimated_value: number | null;
    approved_by: { id: string; full_name: string } | null;
    created_at: string;
}

export interface VehicleDetail extends VehicleRow {
    documents: VehicleDocumentRow[];
    maintenance_history: VehicleMaintenanceRow[];
    rental_history: VehicleRentalRow[];
    booking_history: VehicleBookingRow[];
    /** The rider currently holding this vehicle, from the open assignment. */
    current_rider: { id: string; full_name: string } | null;
    /** Set only once this vehicle has been disposed of. */
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
    /** `battery_percentage` and `next_service_due_date` are gone as sort keys — no columns back them. */
    sortBy: "created_at" | "display_name" | "registration_number";
    sortDir: "asc" | "desc";
}

export interface CreateVehicleInput {
    /** Stored as `display_name`. Optional — a vehicle can just be its plate. */
    name?: string;
    registration_number: string;
    vin: string;
    vehicle_model_id: string;
    hub_id?: string;
    color?: string;
    qr_code?: string;
    imei?: string;
    purchase_date?: string;
    /**
     * NOT accepted. `status` is derived by `recompute_vehicle_status()`;
     * declared here only so the compiler rejects a caller still passing it
     * rather than the value being silently dropped at the insert.
     */
    status?: never;
}

/** The model a vehicle belongs to is fixed at creation. */
export type UpdateVehicleInput = Partial<Omit<CreateVehicleInput, "vehicle_model_id">>;
