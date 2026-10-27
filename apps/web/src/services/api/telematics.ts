import { apiClient } from "./httpClient";

/** Mirrors apps/backend/src/modules/telematics/telematics.types.ts. Admin console only. */
export interface VehicleTelemetry {
  vehicle_id: string;
  registration_number: string;
  lat: number | null;
  lng: number | null;
  speed_kmph: number | null;
  heading_deg: number | null;
  ignition_on: boolean | null;
  immobilised: boolean | null;
  device_battery_v: number | null;
  vehicle_battery_v: number | null;
  soc_percent: number | null;
  battery_temp_c: number | null;
  battery_voltage: number | null;
  battery_current_a: number | null;
  /** The tracker's own odometer — the bike's total kilometres as of `gps_at`. */
  odometer_km: number | null;
  gps_at: string | null;
  can_at: string | null;
  synced_at: string;
  sync_error: string | null;
  /** live ≤ 15 min, stale up to 6 h, offline beyond that or never. */
  freshness: "live" | "stale" | "offline";
}

/** GET /telematics/vehicles/:id — `telemetry` is null until the first sync reaches this scooter. */
export async function fetchVehicleTelemetry(vehicleId: string): Promise<{ telemetry: VehicleTelemetry | null }> {
  return apiClient.get<{ telemetry: VehicleTelemetry | null }>(`/telematics/vehicles/${vehicleId}`);
}

export interface VehicleTelemetryListItem extends VehicleTelemetry {
  vehicle: { id: string; name: string | null; registration_number: string; status: string };
}

/** GET /telematics — every scooter's latest reading (the Live Map and fleet columns). */
export async function fetchFleetTelemetry(): Promise<VehicleTelemetryListItem[]> {
  return apiClient.get<VehicleTelemetryListItem[]>("/telematics");
}

/** Below this charge a scooter is flagged low — the same line the single-vehicle card uses. */
export const LOW_BATTERY_PERCENT = 15;

export const isLowBattery = (t: Pick<VehicleTelemetry, "soc_percent" | "freshness">): boolean =>
  t.soc_percent !== null && t.soc_percent < LOW_BATTERY_PERCENT && t.freshness !== "offline";

export function summariseFleet(list: VehicleTelemetryListItem[]) {
  return {
    total: list.length,
    live: list.filter((t) => t.freshness === "live").length,
    stale: list.filter((t) => t.freshness === "stale").length,
    offline: list.filter((t) => t.freshness === "offline").length,
    lowBattery: list.filter(isLowBattery).length,
    immobilised: list.filter((t) => t.immobilised).length,
  };
}

export interface RentalDistanceSegment {
  registration_number: string;
  from: string;
  to: string;
  distance_km: number | null;
  start_odo: number | null;
  end_odo: number | null;
}

export type RentalDistance =
  | { available: false; reason: "not_configured" | "no_vehicle" | "error"; message: string }
  | {
    available: true;
    distance_km: number;
    start_odo: number | null;
    end_odo: number | null;
    segments: RentalDistanceSegment[];
    /** True once the rental has ended — the figure will not change. */
    is_final: boolean;
    computed_at: string;
  };

/** GET /telematics/rentals/:id/distance — from the tracker's odometer, cached server-side. */
export async function fetchRentalDistance(rentalId: string): Promise<RentalDistance> {
  return apiClient.get<RentalDistance>(`/telematics/rentals/${rentalId}/distance`);
}

export type ControlAction = "immobilise" | "mobilise";

export interface ControlInput {
  reason: string;
  confirmRegistration: string;
  acknowledgeMoving: boolean;
  mode?: "ignition" | "crank" | "movement" | "can" | "charge" | "discharge" | "chargendischarge";
}

/** POST /telematics/vehicles/:id/(immobilise|mobilise) — ADMIN ONLY. `sent` = accepted by the platform, not yet confirmed by the scooter. */
export async function controlVehicle(
  vehicleId: string, action: ControlAction, input: ControlInput,
): Promise<{ command_id: string; provider_cmd_id: string | null; status: "sent" }> {
  return apiClient.post(`/telematics/vehicles/${vehicleId}/${action}`, input);
}

export interface ControlCommand {
  id: string;
  action: ControlAction;
  mode: string;
  reason: string;
  status: "sent" | "failed";
  error: string | null;
  provider_cmd_id: string | null;
  speed_kmph_at_request: number | null;
  created_at: string;
  requested_by: { id: string; full_name: string } | null;
}

/** GET /telematics/vehicles/:id/commands — admin only. */
export async function fetchControlCommands(vehicleId: string): Promise<ControlCommand[]> {
  return apiClient.get<ControlCommand[]>(`/telematics/vehicles/${vehicleId}/commands`);
}

/** One bike's kilometres, from GET /telematics/distance. "7 days" = today and the 6 before. */
export interface BikeKms {
  vehicle: { id: string; name: string | null; registration_number: string; status: string; model: string | null };
  km_today: number;
  km_7d: number;
  km_30d: number;
  updated_at: string | null;
}

export async function fetchBikeKms(): Promise<BikeKms[]> {
  return apiClient.get<BikeKms[]>("/telematics/distance");
}

export interface TrackingFeedStatus {
  /** Latest time the feed's data was written, or null if never. */
  last_updated_at: string | null;
  can_refresh: boolean;
  /** When a manual refresh will be allowed again, if not now. */
  available_at: string | null;
  reason: string | null;
}

export interface TrackingStatus {
  live: TrackingFeedStatus & { every_minutes: number };
  distance: TrackingFeedStatus & { every_hours: number; manual_runs_today: number; manual_cap: number };
}

/** GET /telematics/status — when each feed last updated, and whether a manual refresh is allowed now. */
export async function fetchTrackingStatus(): Promise<TrackingStatus> {
  return apiClient.get<TrackingStatus>("/telematics/status");
}

/** POST /telematics/refresh — ADMIN ONLY. Starts the sync in the background; watch "last updated". */
export async function refreshTracking(kind: "live" | "distance"): Promise<{ started_at: string }> {
  return apiClient.post<{ started_at: string }>("/telematics/refresh", { kind });
}
