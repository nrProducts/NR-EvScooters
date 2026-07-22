export type BookingStatus = "pending_payment" | "confirmed" | "cancelled" | "expired";
export const BOOKING_STATUSES: readonly BookingStatus[] = [
    "pending_payment", "confirmed", "cancelled", "expired",
] as const;

/** Statuses that count as "the rider has a booking in progress." */
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
