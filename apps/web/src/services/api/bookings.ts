import { apiClient, toPaginatedResult, type BackendPaginated } from "./httpClient";
import type { AvailableVehicle, BookingPlanStatus, BookingStatus, PaginatedResult, PickupBooking } from "@/types";

export interface PickupQueueFilters {
  stationId?: string;
  /** Omit to see every status (the "All" tab) — no default is applied server-side. */
  status?: BookingStatus;
  /** Further narrows a 'fulfilled' view into Active/Due/Paused. Ignored for any other status. */
  planStatus?: BookingPlanStatus;
  /** Rental Operations' "Scheduled Renewals" tab — fulfilled bookings that have paid ahead and are waiting to activate. */
  renewalStatus?: "scheduled";
  /** Rental Operations' "Return Requests" tab — only bookings whose active rental has a pending return. */
  returnRequested?: boolean;
  /** "Awaiting Assignment" summary count — confirmed bookings with no vehicle allocated yet. */
  unassigned?: boolean;
  /** Matches rider name/phone, vehicle registration number, booking id, or rental id. */
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: "created_at" | "start_day" | "next_due_at";
  sortDir?: "asc" | "desc";
}

/** GET /bookings — requireStaff. Omit status/planStatus for the "All" tab; pass either for any other stage. */
export async function fetchBookings(filters: PickupQueueFilters = {}): Promise<PaginatedResult<PickupBooking>> {
  const {
    stationId, status, planStatus, renewalStatus, returnRequested, unassigned, search,
    page = 1, pageSize = 8, sortBy, sortDir,
  } = filters;
  const res = await apiClient.get<BackendPaginated<PickupBooking>>("/bookings", {
    page,
    pageSize,
    stationId,
    status,
    planStatus,
    renewalStatus,
    returnRequested,
    unassigned,
    search,
    sortBy,
    sortDir,
  });
  return toPaginatedResult(res);
}

/** PATCH /bookings/:id/late-fee-override — requireStaff (edit action). Pass null to clear the override and fall back to the global setting. */
export async function setLateFeeOverride(bookingId: string, lateFeeOverride: number | null): Promise<void> {
  await apiClient.patch(`/bookings/${bookingId}/late-fee-override`, { late_fee_override: lateFeeOverride });
}

/** GET /bookings/:id/available-vehicles — vehicles free to hand over at this booking's station, for manual override. */
export async function fetchAvailableVehicles(bookingId: string): Promise<AvailableVehicle[]> {
  return apiClient.get<AvailableVehicle[]>(`/bookings/${bookingId}/available-vehicles`);
}

/** POST /bookings/:id/pickup — confirms handover. Omit vehicleId to use the already-allocated vehicle. */
export async function confirmPickup(bookingId: string, vehicleId?: string) {
  return apiClient.post(`/bookings/${bookingId}/pickup`, { vehicle_id: vehicleId });
}

export interface AdminCreateBookingInput {
  user_id: string;
  vehicle_model_id: string;
  station_id: string;
  plan_id: string;
  start_day: string;
  /** Override the plan duration (derived from the end date). */
  duration_days?: number;
  payment?: {
    method: "upi" | "card" | "netbanking" | "wallet" | "cash";
    status: "paid" | "pending";
    /** Default true. False removes the auto transaction-fee line. */
    apply_transaction_fee?: boolean;
    /** Default true. False removes the auto welcome-discount line. */
    apply_welcome_discount?: boolean;
    /** Pricing-rule codes the operator chose not to apply (any active charge/discount rule). */
    exclude_pricing_codes?: string[];
    /** Exact amount collected. */
    amount?: number;
  };
}

/** POST /bookings/admin-create — staff creates a booking for a rider, optionally recording an offline payment. */
export async function adminCreateBooking(input: AdminCreateBookingInput): Promise<PickupBooking> {
  return apiClient.post<PickupBooking>("/bookings/admin-create", input);
}
