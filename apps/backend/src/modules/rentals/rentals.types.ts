export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";
export const RENTAL_STATUSES: readonly RentalStatus[] = [
    "active", "completed", "force_ended", "cancelled",
] as const;

export interface RentalView {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
}

// ---------------------------------------------------------------------------
// Admin — "Ride Management"
// ---------------------------------------------------------------------------

export interface AdminRentalRow {
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
