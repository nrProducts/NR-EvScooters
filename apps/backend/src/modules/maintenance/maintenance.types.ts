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

/** A damaged part recorded when the ticket was resolved. `amount` is before GST. */
export interface MaintenanceDamageItem {
    part: string;
    notes: string | null;
    amount: number;
}

/**
 * What the rider was billed for the damage on this ticket. The `invoice` block
 * is derived from the invoice's allocations — never stored — so it reflects a
 * payment made later in the rider's app as well as one staff recorded.
 */
export interface MaintenanceDamageCharge {
    /** True when this went to a rider as an invoice; false when it was only recorded on the ticket. */
    billed_to_rider: boolean;
    /** How an UNBILLED amount was collected on the spot (upi / cash …); null = not collected. */
    paid_via: string | null;
    gst_rate: number;
    subtotal: number;
    gst_amount: number;
    total: number;
    invoice: {
        id: string;
        invoice_number: string;
        payment_state: "paid" | "partial" | "unpaid";
        /** How the money arrived (upi / cash / …) once something has been paid. */
        payment_method: string | null;
    } | null;
}

/** Offline ways staff can say "the rider already paid this". */
export type DamagePaidVia = "upi" | "cash" | "card" | "netbanking" | "wallet";

/**
 * Damage recorded together with "Mark resolved".
 *
 * `bill_rider` turns the parts into a bill the rider pays from their app;
 * `paid_via` says the money was already handed over — it settles that bill, or,
 * when there is no rider to bill (an unassigned scooter), is simply recorded on
 * the ticket. Without either, the parts are only written to the vehicle's history.
 */
export interface ResolveDamageInput {
    items: Array<{ part: string; notes?: string | null; amount: number }>;
    gst_rate: number;
    bill_rider: boolean;
    /** The rider to bill when the ticket has none linked; ignored if one is. */
    bill_user_id?: string;
    paid_via?: DamagePaidVia;
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
    /** Empty when nothing was recorded at resolve. */
    damage_items: MaintenanceDamageItem[];
    /** Null when the rider wasn't billed for damage. */
    damage_charge: MaintenanceDamageCharge | null;
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
    /** Only accepted together with `status: "resolved"`. */
    damage?: ResolveDamageInput;
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

/**
 * The decision staff make when a support ticket would flag a vehicle that's
 * currently assigned to an active rider — see resolveSupportTicketRiderImpact
 * in support.service.ts. "replace" reuses the same temp-swap machinery as
 * assignTempVehicle (outcome becomes 'temp_vehicle'); "pause" freezes the
 * rider's billing in place via pauseSubscription without touching the vehicle
 * assignment — the vehicle itself is still triaged later like any ticket.
 */
export type RiderImpactDecision =
    | { action: "replace"; replacement_vehicle_id: string }
    | { action: "pause" };

export interface RiderImpactVehicle {
    id: string; name: string; registration_number: string; status: string;
}

export interface RiderImpactRider {
    id: string; full_name: string; phone: string | null;
}

export interface RiderImpactPlan {
    subscription_id: string;
    plan_name: string | null;
    plan_status: string | null;
    current_period_start: string | null;
    next_due_at: string | null;
    /** Sum of unpaid invoice balances on this subscription. */
    outstanding_amount: number;
}

/**
 * What the Support Ticket page needs before it dare move a ride-linked
 * ticket to 'in_progress' — see getRiderImpactPreview. `required: false`
 * means the transition is safe to fire immediately (no active rider on the
 * vehicle, or the ticket isn't ride-linked at all).
 */
export interface RiderImpactPreview {
    required: boolean;
    vehicle?: RiderImpactVehicle;
    rider?: RiderImpactRider;
    plan?: RiderImpactPlan;
}

/** What the rider's home screen renders — derived from their own open, displaced-by ticket, if any. */
export type MaintenanceNoticeStage = "pending_triage" | "quick_fix" | "temp_vehicle";

export interface MaintenanceNoticeView {
    ticket_id: string;
    stage: MaintenanceNoticeStage;
    expected_ready_at: string | null;
    temp_vehicle: MaintenanceTempVehicleRef | null;
}
