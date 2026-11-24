import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { VehicleTelemetry, VehicleTelemetryListItem } from "./telematics.types";

/**
 * Telemetry reads.
 *
 * `vehicle_telemetry` is written by the telematics-sync Edge Function and is
 * not in the generated database types yet, so it is read through an untyped
 * client. This module only ever READS it: nothing in the backend talks to
 * Intellicar, and nothing here can command a vehicle.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

const LIVE_MS = 15 * 60_000;
const OFFLINE_MS = 6 * 3_600_000;

// Every column, deliberately: `odometer_km` arrived in a later migration, and an
// explicit list naming it would make every live screen fail until that
// migration is applied. With `*` a missing column is simply absent.
const COLUMNS = "*";

type Raw = Omit<VehicleTelemetry, "freshness">;

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export function freshnessOf(gpsAt: string | null, now: number = Date.now()): VehicleTelemetry["freshness"] {
    if (!gpsAt) return "offline";
    const age = now - new Date(gpsAt).getTime();
    if (age <= LIVE_MS) return "live";
    return age > OFFLINE_MS ? "offline" : "stale";
}

function toTelemetry(row: Raw): VehicleTelemetry {
    return {
        ...row,
        // numeric columns arrive as strings from PostgREST
        lat: numOrNull(row.lat), lng: numOrNull(row.lng),
        speed_kmph: numOrNull(row.speed_kmph), heading_deg: numOrNull(row.heading_deg),
        device_battery_v: numOrNull(row.device_battery_v), vehicle_battery_v: numOrNull(row.vehicle_battery_v),
        soc_percent: numOrNull(row.soc_percent), battery_temp_c: numOrNull(row.battery_temp_c),
        battery_voltage: numOrNull(row.battery_voltage), battery_current_a: numOrNull(row.battery_current_a),
        odometer_km: numOrNull(row.odometer_km),
        freshness: freshnessOf(row.gps_at),
    };
}

/** The latest reading for one vehicle, or null when it has never synced. */
export async function getVehicleTelemetry(vehicleId: string): Promise<VehicleTelemetry | null> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const { data, error } = await db.from("vehicle_telemetry").select(COLUMNS).eq("vehicle_id", vehicleId).maybeSingle();
    if (error) throw error;
    return data ? toTelemetry(data as Raw) : null;
}

/** Every vehicle's latest reading — the fleet list and, later, the live map. */
export async function listVehicleTelemetry(): Promise<VehicleTelemetryListItem[]> {
    const { data, error } = await db
        .from("vehicle_telemetry")
        .select(`${COLUMNS}, vehicles(id, display_name, registration_number, status)`);
    if (error) throw error;

    return ((data ?? []) as unknown as (Raw & { vehicles: unknown })[]).map((row) => {
        const v = (Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles) as
            { id: string; display_name: string | null; registration_number: string; status: string } | null;
        return {
            ...toTelemetry(row),
            vehicle: {
                id: v?.id ?? row.vehicle_id,
                name: v?.display_name ?? null,
                registration_number: v?.registration_number ?? row.registration_number,
                status: v?.status ?? "unknown",
            },
        };
    });
}

// ---------------------------------------------------------------------------
// Bike KMs — distance per scooter, summed from vehicle_distance_daily
// ---------------------------------------------------------------------------

export interface BikeKmsRow {
    vehicle: { id: string; name: string | null; registration_number: string; status: string; model: string | null };
    km_today: number;
    km_7d: number;
    km_30d: number;
    /** The rider who has this bike right now, or null when it is not with anyone. */
    current_rider: { id: string; full_name: string; phone: string | null } | null;
    /** When the stored figures were last refreshed; null if never. */
    updated_at: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Adds `days` to a YYYY-MM-DD business day, UTC-anchored so no local zone shifts it. */
function plusDays(day: string, days: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

export interface VehicleKmsDay {
    day: string;
    km: number;
    /** False when the sync has no figure for that day (shown as "—", not as 0 km). */
    has_data: boolean;
}

export interface VehicleKms {
    today: string;
    km_today: number;
    /** Today and the 6 days before it. */
    km_7d: number;
    km_30d: number;
    /** Newest first: today, yesterday, … six days ago. Always 7 entries. */
    days: VehicleKmsDay[];
    /** When the stored figures were last refreshed; null if never. */
    updated_at: string | null;
}

/**
 * One scooter's kilometres for the Vehicle detail page: today, each of the last
 * 7 days, and the 7- and 30-day totals. Same source and same definitions as
 * listBikeKms (vehicle_distance_daily), so this page and the Bike KMs list agree.
 */
export async function getVehicleKms(vehicleId: string, today: string): Promise<VehicleKms> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const from30 = plusDays(today, -29);
    const { data, error } = await db
        .from("vehicle_distance_daily")
        .select("day, distance_km, updated_at")
        .eq("vehicle_id", vehicleId)
        .gte("day", from30)
        .lte("day", today);
    // Table not migrated yet / brief DB error: show "no data" rather than failing the page.
    if (error) console.warn("[telematics] vehicle_distance_daily unreadable", error.message);

    const byDay = new Map<string, number>();
    let updatedAt: string | null = null;
    let km30 = 0;
    for (const r of ((error ? [] : data) ?? []) as { day: string; distance_km: number | string; updated_at: string }[]) {
        const km = Number(r.distance_km);
        byDay.set(r.day, km);
        km30 += km;
        if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
    }

    const days: VehicleKmsDay[] = [];
    let km7 = 0;
    for (let i = 0; i < 7; i++) {
        const day = plusDays(today, -i);
        const km = byDay.get(day);
        days.push({ day, km: round1(km ?? 0), has_data: km !== undefined });
        km7 += km ?? 0;
    }

    return {
        today,
        km_today: round1(byDay.get(today) ?? 0),
        km_7d: round1(km7),
        km_30d: round1(km30),
        days,
        updated_at: updatedAt,
    };
}

/**
 * Every live (non-retired) scooter with its kilometres today, over the last 7
 * days and over the last 30 — including scooters with no data, shown as 0, so
 * the list is the whole fleet and not just the ones that happened to move.
 * "Last 7 days" means today and the 6 days before it.
 */
export async function listBikeKms(today: string): Promise<BikeKmsRow[]> {
    const from30 = plusDays(today, -29);
    const from7 = plusDays(today, -6);

    const [vehiclesRes, daysRes, ridersRes] = await Promise.all([
        supabaseAdmin
            .from("vehicles")
            .select("id, display_name, registration_number, status, vehicle_models(name)")
            .neq("status", "retired"),
        db.from("vehicle_distance_daily")
            .select("vehicle_id, day, distance_km, updated_at")
            .gte("day", from30)
            .lte("day", today),
        // Who holds each bike right now — the same view the Vehicles list uses for "Rider".
        supabaseAdmin.from("v_rental_current_vehicle").select("vehicle_id, users(id, full_name, phone)"),
    ]);
    if (vehiclesRes.error) throw vehiclesRes.error;
    if (ridersRes.error) throw ridersRes.error;

    const riderByVehicle = new Map<string, { id: string; full_name: string; phone: string | null }>();
    for (const r of (ridersRes.data ?? []) as unknown as { vehicle_id: string; users: unknown }[]) {
        const u = (Array.isArray(r.users) ? r.users[0] : r.users) as { id: string; full_name: string; phone: string | null } | null;
        if (r.vehicle_id && u) riderByVehicle.set(r.vehicle_id, u);
    }
    // No distance table yet (not migrated) or a brief DB error: list the fleet with zeros
    // rather than failing the whole page.
    if (daysRes.error) console.warn("[telematics] vehicle_distance_daily unreadable", daysRes.error.message);

    const sums = new Map<string, { t: number; d7: number; d30: number; at: string | null }>();
    for (const r of ((daysRes.error ? [] : daysRes.data) ?? []) as { vehicle_id: string; day: string; distance_km: number | string; updated_at: string }[]) {
        const s = sums.get(r.vehicle_id) ?? { t: 0, d7: 0, d30: 0, at: null };
        const km = Number(r.distance_km);
        s.d30 += km;
        if (r.day >= from7) s.d7 += km;
        if (r.day === today) s.t += km;
        if (!s.at || r.updated_at > s.at) s.at = r.updated_at;
        sums.set(r.vehicle_id, s);
    }

    return ((vehiclesRes.data ?? []) as unknown as {
        id: string; display_name: string | null; registration_number: string; status: string; vehicle_models: unknown;
    }[])
        .map((v) => {
            const s = sums.get(v.id);
            const model = (Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models) as { name: string } | null;
            return {
                vehicle: {
                    id: v.id, name: v.display_name, registration_number: v.registration_number,
                    status: v.status, model: model?.name ?? null,
                },
                km_today: round1(s?.t ?? 0),
                km_7d: round1(s?.d7 ?? 0),
                km_30d: round1(s?.d30 ?? 0),
                current_rider: riderByVehicle.get(v.id) ?? null,
                updated_at: s?.at ?? null,
            };
        })
        .sort((a, b) => b.km_30d - a.km_30d || a.vehicle.registration_number.localeCompare(b.vehicle.registration_number));
}
