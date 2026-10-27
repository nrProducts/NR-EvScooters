/** Latest GPS + battery reading for one scooter. Mirrors `vehicle_telemetry`. */
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
    /**
     * How fresh the position is: `live` (≤15 min), `stale` (older), `offline`
     * (> 6 h or never), so the console can tell a parked scooter from one
     * that has stopped reporting.
     */
    freshness: "live" | "stale" | "offline";
}

/** One row of the fleet-wide list. */
export interface VehicleTelemetryListItem extends VehicleTelemetry {
    vehicle: { id: string; name: string | null; registration_number: string; status: string };
}
