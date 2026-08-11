/**
 * 'completed' (20260811100000): the booking's whole lifecycle is over — the
 * rider returned the scooter for good (completeRide on the booking's
 * active_rental_id). Distinct from 'fulfilled', which now means "picked up
 * and still riding" (plan_status active/due/paused) — before this, a
 * fulfilled booking never had a terminal state at all.
 */
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired" | "fulfilled" | "completed";
export const BOOKING_STATUSES: readonly BookingStatus[] = [
    "pending_payment", "confirmed", "cancelled", "expired", "fulfilled", "completed",
] as const;

/**
 * Statuses that count as "the rider has a booking in progress." 'fulfilled'
 * is deliberately excluded — once a booking is fulfilled the rider's active
 * state is the rental (has_active_rental), not the booking anymore.
 */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ["pending_payment", "confirmed"] as const;

export interface CreateBookingInput {
    vehicle_model_id: string;
    station_id: string;
    plan_id: string;
    start_day: string; // YYYY-MM-DD
}

/**
 * No payment is ever captured in this phase, so a refund is a recorded request
 * for the future checkout phase rather than a reversal. 'not_required' covers a
 * cancellation whose refund works out to zero.
 */
export type BookingRefundStatus = "pending" | "processed" | "not_required";

export interface CancelBookingInput {
    reason?: string;
}

export interface BookingView {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    /**
     * duration_days is the plan's renewal period — both the recurring-billing
     * cadence (next_due_at) and what confirmPickup freezes onto the rental as
     * expires_at. deposit_amount is the security deposit charged alongside it.
     */
    plan: {
        id: string; name: string; billing_cycle: string; price: number;
        duration_days: number; deposit_amount: number;
    } | null;
    /**
     * The specific physical unit reserved for this booking, if any —
     * populated by allocate_vehicle_for_booking() (20260727095801), which
     * runs as soon as a matching available vehicle exists. Null means no
     * unit is free yet at this model/station.
     */
    vehicle: {
        id: string; name: string; registration_number: string; battery_percentage: number;
        status: "available" | "booked" | "assigned" | "maintenance" | "scrap";
    } | null;
    /** Flat discount stamped by a qualifying first-booking referral, if any. */
    referral_discount_amount: number | null;

    // --- pre-pickup cancellation (all null unless the rider cancelled) ------
    // Note these stay null for bookings closed by the staff reject flow, which
    // predates this feature and records nothing beyond status='cancelled'.
    cancelled_at: string | null;
    cancellation_reason: string | null;
    /** Net amount owed (plan price minus referral discount), frozen at cancel time. */
    plan_price_at_cancellation: number | null;
    cancellation_penalty_amount: number | null;
    refund_amount: number | null;
    refund_status: BookingRefundStatus | null;

    // --- recurring-billing plan state (all null until confirmPickup activates it) ---
    plan_status: "active" | "due" | "paused" | null;
    plan_activated_at: string | null;
    /** Snapshot of plans.duration_days at activation — the plan template may change later. */
    plan_duration_days: number | null;
    /** Snapshot of plans.deposit_amount at booking-payment time. */
    deposit_amount_at_booking: number | null;
    current_period_start: string | null;
    next_due_at: string | null;
    plan_paused_at: string | null;
    plan_paused_days_total: number;
}

export interface PickupQueueFilters {
    page: number;
    pageSize: number;
    stationId?: string;
    /** Omit to see every status ("All" tab) — no default is applied server-side. */
    status?: BookingStatus;
    /** Further narrows a 'fulfilled' view into Active/Due/Paused. Ignored for any other status. */
    planStatus?: "active" | "due" | "paused";
}

export interface BookingHistoryFilters {
    page: number;
    pageSize: number;
}

export interface PickupBookingView extends BookingView {
    rider: { id: string; full_name: string; phone: string | null };
}

export interface ConfirmPickupInput {
    /** Manual override — omit to use the booking's already-allocated vehicle_id. */
    vehicle_id?: string;
}

export interface AvailableVehicleView {
    id: string;
    name: string;
    registration_number: string;
    battery_percentage: number;
}
