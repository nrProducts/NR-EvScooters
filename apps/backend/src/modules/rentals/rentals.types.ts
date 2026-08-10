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

export interface RentalView extends RentalReturnFields {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    /** Lets the rider app resolve which booking's plan/deposit/damage/payment history this rental belongs to. */
    booking_id: string | null;
    vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
}

export interface RequestReturnInput {
    reason: string;
    feedback?: string;
    rating: number;
}

// ---------------------------------------------------------------------------
// Admin — "Ride Management"
// ---------------------------------------------------------------------------

export interface AdminRentalRow extends RentalReturnFields {
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
