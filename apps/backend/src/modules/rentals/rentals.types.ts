export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";

export interface RentalView {
    id: string;
    status: RentalStatus;
    started_at: string;
    ended_at: string | null;
    vehicle: { id: string; name: string; registration_number: string; battery_percentage: number } | null;
    station: { id: string; name: string; code: string } | null;
    plan: { id: string; name: string; billing_cycle: string; price: number } | null;
}
