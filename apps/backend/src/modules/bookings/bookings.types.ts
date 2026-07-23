export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired" | "fulfilled";
export const BOOKING_STATUSES: readonly BookingStatus[] = [
    "pending_payment", "confirmed", "cancelled", "expired", "fulfilled",
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

export interface BookingView {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_model: { id: string; name: string } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
}

export interface PickupQueueFilters {
    page: number;
    pageSize: number;
    stationId?: string;
}

export interface PickupBookingView extends BookingView {
    rider: { id: string; full_name: string; phone: string | null };
}

export interface ConfirmPickupInput {
    vehicle_id: string;
}

export interface AvailableVehicleView {
    id: string;
    name: string;
    registration_number: string;
    battery_percentage: number;
}
