/**
 * A booking is a RESERVATION now, and only that.
 *
 * The table lost twenty-three columns. All the plan state (`plan_status`,
 * `next_due_at`, `plan_paused_at`, the renewal group…) belongs to
 * `subscriptions` and `subscription_periods`; the cancellation group belongs
 * to `booking_cancellations`; the refund mirror belongs to `refunds`. What is
 * left is who wants which plan, at which hub, from which day — plus the
 * price/deposit/duration snapshots taken when they asked.
 *
 * **The wire shape below is deliberately kept flat and mostly unchanged.**
 * Both apps read it, and reshaping the API is Stage 10's job, not the
 * database migration's. The service reassembles these fields from four tables
 * and a view on the way out, in one place.
 */

/**
 * `public.booking_status` has five values. `completed` is NOT one of them.
 *
 * The old schema added it to mean "the rider returned the scooter for good",
 * which was a sixth state on the wrong row — the booking did not change when
 * the rental ended, the SUBSCRIPTION did. It survives here as a DERIVED view
 * value (a fulfilled booking whose subscription has ended), because both
 * apps filter on it, but nothing writes it.
 */
export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired" | "fulfilled";
export const BOOKING_STATUSES: readonly BookingStatus[] = [
    "pending_payment", "confirmed", "cancelled", "expired", "fulfilled",
] as const;

/** What `BookingView.status` can report — the stored values plus `completed`. */
export type BookingLifecycleStatus = BookingStatus | "completed";

/**
 * Statuses that count as "the rider has a booking in progress." `fulfilled`
 * is deliberately excluded — once a booking is fulfilled the rider's active
 * state is the subscription, not the booking anymore.
 */
export const ACTIVE_BOOKING_STATUSES: readonly BookingStatus[] = ["pending_payment", "confirmed"] as const;

export interface CreateBookingInput {
    vehicle_model_id: string;
    /** `bookings.hub_id`. The API name is unchanged; `stations` is `hubs`. */
    station_id: string;
    plan_id: string;
    /** `bookings.requested_start_on`. YYYY-MM-DD. */
    start_day: string;
}

/**
 * Derived from the linked `refunds` row rather than stored on the booking.
 *
 * `bookings` used to mirror five refund columns; a refund now has exactly one
 * home. The vocabulary is preserved for the clients: `processed` is the
 * refunds table's `succeeded`, and `not_required` is the absence of a refund
 * row for a cancellation that owed nothing.
 */
export type BookingRefundStatus = "pending" | "processing" | "processed" | "not_required" | "failed";

export interface CancelBookingInput {
    reason?: string;
}

export interface BookingView {
    id: string;
    status: BookingLifecycleStatus;
    /** `bookings.requested_start_on`. */
    start_day: string;
    created_at: string;
    /** When an unpaid hold lapses. Null once the booking is no longer pending. */
    hold_expires_at: string | null;
    vehicle_model: { id: string; name: string } | null;
    /** From `hubs`. `lat`/`lng` are the generated `latitude`/`longitude`. */
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    /**
     * The plan as it was when the rider booked it, from the booking's own
     * snapshot columns rather than the live `plans` row — `plan_price_snapshot`,
     * `duration_days_snapshot`, `deposit_amount_snapshot`. A later repricing
     * cannot rewrite what someone already agreed to.
     */
    plan: {
        id: string; name: string; billing_cycle: string; price: number;
        duration_days: number; deposit_amount: number;
    } | null;
    /**
     * The unit reserved for this booking — `bookings.held_vehicle_id`, set by
     * `allocate_vehicle_for_booking()`. Null means nothing is free yet at this
     * model/hub. Once the rider is riding, this is the vehicle their rental
     * currently holds, which is not necessarily the one that was reserved.
     */
    vehicle: {
        id: string; name: string; registration_number: string;
        status: "available" | "reserved" | "assigned" | "maintenance" | "retired";
    } | null;
    /**
     * Flat discount from a qualifying first-booking referral.
     *
     * No longer a booking column: a discount is a `subscription_adjustments`
     * row with a negative amount, like every other discount. Null before the
     * subscription exists.
     */
    referral_discount_amount: number | null;

    // --- cancellation, from booking_cancellations + refunds -----------------
    cancelled_at: string | null;
    cancellation_reason: string | null;
    /** Net amount owed at cancel time. Reconstructed from the snapshot and the penalty. */
    plan_price_at_cancellation: number | null;
    cancellation_penalty_amount: number | null;
    refund_amount: number | null;
    refund_status: BookingRefundStatus | null;
    refund_initiated_at: string | null;
    refund_completed_at: string | null;
    /** `refunds.gateway_refund_id`. */
    refund_transaction_id: string | null;

    // --- subscription state (all null until payment creates the subscription) ---
    /** `subscriptions.status`, narrowed. `due` was renamed `past_due`. */
    plan_status: "active" | "past_due" | "paused" | null;
    /** `subscriptions.started_on`. */
    plan_activated_at: string | null;
    /** `subscriptions.duration_days_snapshot`. */
    plan_duration_days: number | null;
    /** `bookings.deposit_amount_snapshot`. */
    deposit_amount_at_booking: number | null;
    /** Current period's `starts_on`. */
    current_period_start: string | null;
    /** Current period's `due_on`. */
    next_due_at: string | null;
    /** The open `subscription_pauses.paused_at`, if the plan is paused. */
    plan_paused_at: string | null;
    /** Sum of `subscription_pauses.days_paused`. */
    plan_paused_days_total: number;
    /**
     * `scheduled` once a renewal has been paid but not yet started. That is a
     * `subscription_periods` row with `status = 'scheduled'` now, rather than
     * a pair of columns on the booking — which means a renewal is a real
     * period with real dates before it activates, not a promise of one.
     */
    renewal_status: "none" | "scheduled";
    scheduled_start_date: string | null;
    scheduled_duration_days: number | null;
    /**
     * Per-subscription late-fee rate. A `pricing_rules` row scoped to the
     * subscription — see renewalFee.ts. Null when only the global rule applies.
     */
    late_fee_override: number | null;

    /**
     * The rental this booking's handover opened.
     *
     * Reached through the subscription rather than a `bookings.active_rental_id`
     * column. The return fields come from `rental_returns`, which is where the
     * return workflow moved.
     */
    active_rental: BookingActiveRental | null;
    /**
     * Live estimate of the late-return fee that WOULD be settled if this
     * booking's return request were approved right now — not a stored value.
     * Null unless a return is actually pending.
     */
    return_late_fee_preview: { days_late: number; penalty_amount: number; fee_per_day: number } | null;
}

export interface BookingActiveRental {
    id: string;
    status: string;
    /** `rentals.picked_up_at`. */
    started_at: string;
    /** From `rental_returns` — null until the rider asks to hand the scooter back. */
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    /** `COALESCE(rental_returns.due_back_at, rentals.due_back_at)`. */
    return_due_at: string | null;
    return_approved_at: string | null;
    /**
     * Vehicle Return → Inspection → Payment Gate summary — set only on the
     * Returns list's Pending tab (see returnStageSummaryFor in
     * returns.service.ts); undefined everywhere else loadBookingContext is
     * used, so as not to add the extra query to every booking-context read.
     */
    charges?: number;
    amount_due?: number;
    payment_status?: "not_required" | "pending" | "paid";
}

export interface PickupQueueFilters {
    page: number;
    pageSize: number;
    /** Filters `bookings.hub_id`. */
    stationId?: string;
    /** Omit to see every status ("All" tab) — no default is applied server-side. */
    status?: BookingLifecycleStatus;
    /** Further narrows a `fulfilled` view. Ignored for any other status. */
    planStatus?: "active" | "past_due" | "paused";
    /** "Scheduled Renewals" — bookings whose subscription has a scheduled period. */
    renewalStatus?: "scheduled";
    /** "Return Requests" — bookings whose rental has an open `rental_returns` row. */
    returnRequested?: boolean;
    /** "Awaiting Assignment" — confirmed bookings with no vehicle held yet. */
    unassigned?: boolean;
    /** Matches rider name/phone, vehicle registration number, booking id, or rental id. */
    search?: string;
    sortBy: "created_at" | "requested_start_on";
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
    /** Manual override — omit to use the booking's already-held vehicle. */
    vehicle_id?: string;
}

export interface AvailableVehicleView {
    id: string;
    name: string;
    registration_number: string;
}
