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
 * 'pending': a refund has been requested but a staff member has not yet
 * approved it ("Awaiting Approval" in the admin UI) — the gateway is never
 * contacted until POST /refunds/:id/retry is called (doubles as Approve).
 * 'processing': approved and the gateway call is in flight ("Refund
 * Initiated" — normally too brief to observe, since processRefund calls the
 * gateway synchronously). 'processed': the gateway confirmed it ("Refunded").
 * 'failed': the gateway call failed, needs a staff retry. 'not_required'
 * covers a cancellation whose refund works out to zero (or nothing was ever
 * paid).
 */
export type BookingRefundStatus = "pending" | "processing" | "processed" | "not_required" | "failed";

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
    refund_initiated_at: string | null;
    refund_completed_at: string | null;
    refund_transaction_id: string | null;

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
    /** 'scheduled' once an on-time/early renewal has been paid but not yet activated — see payments.service.ts's applyWeeklyDueSuccess. */
    renewal_status: "none" | "scheduled";
    /** When the scheduled renewal will activate (the payment-overdue-sweep does this once next_due_at arrives). Null unless renewal_status is 'scheduled'. */
    scheduled_start_date: string | null;
    scheduled_duration_days: number | null;
    /** Admin-set per-booking override for the late renewal fee — wins over the global plan_renewal_settings amount when a renewal is late. */
    late_fee_override: number | null;

    /**
     * The rental this booking's handover opened (bookings.active_rental_id),
     * carrying just enough of the rental's own return-request/settlement
     * state (rentals.types.ts's RentalReturnFields) for the Rental
     * Operations screen to surface a pending return without a second round
     * trip. Null for anything pre-pickup, and stays populated after
     * completion (the rental link is never cleared) for return history.
     */
    active_rental: BookingActiveRental | null;
    /**
     * Live estimate of the late-return fee that WOULD be settled if this
     * booking's return request were approved right now — not a stored
     * value, computed the same way completeRide's settlement is (see
     * computeLateReturnPenalty in rentals.service.ts). Null unless a return
     * is actually pending.
     */
    return_late_fee_preview: { days_late: number; penalty_amount: number; fee_per_day: number } | null;
}

export interface BookingActiveRental {
    id: string;
    status: string;
    started_at: string;
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    return_approved_at: string | null;
}

export interface PickupQueueFilters {
    page: number;
    pageSize: number;
    stationId?: string;
    /** Omit to see every status ("All" tab) — no default is applied server-side. */
    status?: BookingStatus;
    /** Further narrows a 'fulfilled' view into Active/Due/Paused. Ignored for any other status. */
    planStatus?: "active" | "due" | "paused";
    /** Rental Operations' "Scheduled Renewals" tab — fulfilled bookings that have paid ahead and are waiting to activate. */
    renewalStatus?: "scheduled";
    /** Rental Operations' "Return Requests" tab — only fulfilled bookings whose active rental has a pending return. */
    returnRequested?: boolean;
    /** "Awaiting Assignment" summary count — confirmed bookings with no vehicle allocated yet. */
    unassigned?: boolean;
    /** Matches rider name/phone, vehicle registration number, booking id, or rental id. */
    search?: string;
    sortBy: "created_at" | "start_day" | "next_due_at";
    sortDir: "asc" | "desc";
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
