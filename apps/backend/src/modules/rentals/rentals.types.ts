/**
 * `rental_status` has three values, not four. `cancelled` is gone: a rental
 * that never really happened is a booking that was cancelled, and no rental
 * row should have existed for it.
 */
export type RentalStatus = "active" | "completed" | "force_ended";
export const RENTAL_STATUSES: readonly RentalStatus[] = [
    "active", "completed", "force_ended",
] as const;

/**
 * The return workflow.
 *
 * These were eight columns on `rentals`, all null for every rental where no
 * return was pending. They are a `rental_returns` row now — one per return,
 * with its own `return_status` (requested → inspected → approved / rejected),
 * which is what makes rejecting and re-requesting a return expressible instead
 * of being simulated by nulling four columns back out.
 *
 * The settlement half (`days_late`, `late_penalty_amount`) moved further
 * still, to `rental_settlements`, where it sits alongside damage and deposit
 * arithmetic the database itself checks.
 */
export interface RentalReturnFields {
    /** `rental_returns.requested_at`. */
    return_requested_at: string | null;
    /** `rental_returns.requested_reason`. */
    return_reason: string | null;
    /** `rental_returns.rider_notes`. */
    return_feedback: string | null;
    /** `COALESCE(rental_returns.due_back_at, rentals.due_back_at)` — see effectiveDueAt(). */
    return_due_at: string | null;
    return_approved_at: string | null;
    /** From `rental_settlements`, once settled. */
    days_late: number | null;
    /** `rental_settlements.late_fee_amount`. */
    late_penalty_amount: number | null;
    late_fee_per_day: number | null;
}

/**
 * The rider's plan.
 *
 * `rentals` no longer snapshots the plan: `plan_id`, `plan_duration_days`,
 * `plan_price_at_pickup` and `expires_at` are gone. The subscription holds the
 * agreement and its snapshots, and the current period holds the dates — so
 * these are read through `subscription_id` rather than frozen onto the rental.
 *
 * `expires_at` in particular was frozen at pickup as the FIRST period's end,
 * which stopped meaning anything by week two. Its successor is the current
 * period's `ends_on`, which rolls forward with every renewal, and
 * `rentals.due_back_at` — which IS a real column, kept current by the same.
 */
export interface RentalPlanPeriodFields {
    plan_id: string | null;
    /** `subscriptions.duration_days_snapshot`. */
    plan_duration_days: number | null;
    /** `subscriptions.plan_price_snapshot`. */
    plan_price_at_pickup: number | null;
    /** `rentals.due_back_at` — the live deadline, no longer a pickup-time freeze. */
    expires_at: string | null;
}

export interface RentalView extends RentalReturnFields, RentalPlanPeriodFields {
    id: string;
    status: RentalStatus;
    /** `rentals.picked_up_at`. */
    started_at: string;
    /** `rentals.returned_at`. */
    ended_at: string | null;
    /** Resolved through `subscriptions.booking_id`; `rentals.booking_id` is gone. */
    booking_id: string | null;
    /**
     * The vehicle currently assigned, from `v_rental_current_vehicle`.
     *
     * `battery_percentage` and `next_service_due_date` are dropped: neither is
     * a column any more. Both were static placeholders awaiting a telemetry
     * integration that never landed — the charge level was 100 on every row.
     */
    vehicle: {
        id: string;
        name: string;
        registration_number: string;
    } | null;
    /** The booking's pickup hub. */
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
    /** `subscriptions.status`, narrowed. `due` was renamed `past_due`. */
    plan_status: "active" | "past_due" | "paused" | null;
    /** The current period's `due_on`. */
    next_due_at: string | null;
    /** The current period's `starts_on`. */
    current_period_start: string | null;
    /** `scheduled` once a renewal period exists but has not started. */
    renewal_status: "none" | "scheduled" | null;
    scheduled_start_date: string | null;
    /** `rentals.recovery_flagged_at` — set once by vehicle-recovery-sweep; never cleared. */
    recovery_flagged_at: string | null;
    /** `return_recovery_settings.max_late_fee_days` — the cap the rider's own late-fee display should use. */
    max_late_fee_days: number;
}

export interface RequestReturnInput {
    reason: string;
    feedback?: string;
    rating: number;
}

// ---------------------------------------------------------------------------
// Admin — "Ride Management"
// ---------------------------------------------------------------------------

export interface AdminRentalRow extends RentalReturnFields, RentalPlanPeriodFields {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    /**
     * Battery readings and `fare` have no columns in the new schema.
     *
     * `fare` never had a value — this is a subscription product, not a
     * per-ride one, and money lives on invoices. The battery pair was
     * telemetry that was never wired up. Kept on the wire as constant nulls so
     * the admin table keeps rendering until Stage 10 removes the columns.
     */
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    fare: number | null;
    rider: { id: string; full_name: string; phone: string | null } | null;
    vehicle: { id: string; name: string; registration_number: string } | null;
    /** `rental_returns.approved_by_user_id`. */
    return_approved_by: { id: string; full_name: string } | null;
    /** `rental_returns.inspected_at` — gates deposit-refund eligibility. */
    inspected_at: string | null;
    inspected_by: { id: string; full_name: string } | null;
    /** `rentals.recovery_flagged_at` — set once by vehicle-recovery-sweep; never cleared. */
    recovery_flagged_at: string | null;
}

export interface RejectReturnInput {
    reason: string;
}

export interface ListRentalsFilters {
    page: number;
    pageSize: number;
    status?: RentalStatus;
    /** Active rentals flagged by vehicle-recovery-sweep — the "awaiting recovery" admin tab. */
    recoveryRequired?: boolean;
}

export interface CompleteRideInput {
    end_battery_pct?: number;
    /** Staff-customised late fee; omitted means "use the computed amount". */
    late_fee_override?: number;
    /** Confirms a clean physical inspection when no damage was recorded. See assertInspected(). */
    inspected?: boolean;
    /**
     * Ad-hoc charges the full return review adds on top of late fee and
     * damage (cleaning, a missing helmet). Only the return-settlement path
     * supplies it; a plain completeRide leaves it zero.
     */
    other_charges_amount?: number;
}

export interface MoveToMaintenanceInput {
    description: string;
    end_battery_pct?: number;
    late_fee_override?: number;
    inspected?: boolean;
}
