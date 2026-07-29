import { apiClient } from "./httpClient";

export type RentalStatus = "active" | "completed" | "force_ended" | "cancelled";

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

export interface CompleteRideInput {
  end_battery_pct?: number;
}

/** POST /rentals/:id/complete — requireStaff. Ends the ride; the DB trigger returns the vehicle to 'available'. */
export async function completeRide(id: string, input: CompleteRideInput = {}): Promise<AdminRentalRow> {
  return apiClient.post<AdminRentalRow>(`/rentals/${id}/complete`, input);
}

export interface MoveToMaintenanceInput {
  description: string;
  end_battery_pct?: number;
}

/** POST /rentals/:id/maintenance — requireStaff. Ends the ride, flips the vehicle to 'maintenance', and opens a ticket. */
export async function moveRideToMaintenance(id: string, input: MoveToMaintenanceInput): Promise<AdminRentalRow> {
  return apiClient.post<AdminRentalRow>(`/rentals/${id}/maintenance`, input);
}
