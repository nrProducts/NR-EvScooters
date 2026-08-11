export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";
export const RENTAL_STATUSES: readonly RentalStatus[] = [
    "active", "completed", "force_ended", "cancelled",
] as const;

/**
 * Post-pickup return request + late-fee settlement. All null until the rider
 * requests a return; the settlement half stays null until staff confirm the
 * physical handover. Note the rental remains 'active' throughout — see
 * requestReturn for why.
 */
export interface RentalReturnFields {
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    days_late: number | null;
    late_penalty_amount: number | null;
    late_fee_per_day: number | null;
}

/**
 * The rider's plan, frozen at pickup (20260804100000). Null on rentals with
 * no booking to inherit a plan from — those simply never expire.
 *
 * expires_at is the DEFAULT return deadline, so the rider's effective
 * deadline is `return_due_at ?? expires_at` — see effectiveDueAt().
 */
export interface RentalPlanPeriodFields {
    plan_id: string | null;
    plan_duration_days: number | null;
    plan_price_at_pickup: number | null;
    expires_at: string | null;
}

export interface RentalView extends RentalReturnFields, RentalPlanPeriodFields {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    /** Lets the rider app resolve which booking's plan/deposit/damage/payment history this rental belongs to. */
    booking_id: string | null;
    vehicle: {
        id: string;
        name: string;
        registration_number: string;
        battery_percentage: number;
        /** Scheduled service date (vehicles.next_service_due_date). Null until fleet ops set one. */
        next_service_due_date: string | null;
    } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
    /**
     * The recurring-billing state of the booking this rental belongs to
     * (bookings.plan_status/next_due_at — null on a rental with no plan).
     * Unlike expires_at (frozen at pickup as the FIRST period's end),
     * next_due_at rolls forward every time the rider pays for a new week —
     * it's what actually reflects "is the rider's current committed period
     * over yet", which requestReturn's early-return gate is anchored to.
     */
    plan_status: "active" | "due" | "paused" | null;
    next_due_at: string | null;
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
    start_battery_pct: number | null;
    end_battery_pct: number | null;
    fare: number | null;
    rider: { id: string; full_name: string; phone: string | null } | null;
    vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
}

export interface ListRentalsFilters {
    page: number;
    pageSize: number;
    status?: RentalStatus;
}

export interface CompleteRideInput {
    end_battery_pct?: number;
}

export interface MoveToMaintenanceInput {
    description: string;
    end_battery_pct?: number;
}
