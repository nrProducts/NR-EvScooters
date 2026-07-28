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
    station: { id: string; name: string; code: string; lat: number; lng: number } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
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
}

export interface PickupQueueFilters {
    page: number;
    pageSize: number;
    stationId?: string;
    /** Omit for the original "awaiting pickup" behavior (confirmed only). */
    status?: BookingStatus;
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
