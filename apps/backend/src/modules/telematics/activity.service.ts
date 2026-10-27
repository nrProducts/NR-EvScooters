import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { businessToday } from "../../common/dates";
import { computeDailyActivity } from "./activity.calc";
import { getGpsHistory, intellicarConfigured, resolveVehicleNo } from "./intellicar.client";

/**
 * Last-7-days activity for one scooter: running (ignition-on) hours, moving
 * hours and trips, one row per business day (IST) — today and the six days
 * before it. (Kilometres are not here: see activity.calc.ts for why.)
 *
 * Budget: every GPS-history call counts toward Intellicar's 24 per bike per day
 * (the daily-distance job already uses ~14). So this is cache-first:
 *   • a finished day never changes → fetched once, stored `is_final`;
 *   • today is refreshed at most every TODAY_TTL_MS, and only when someone
 *     actually opens the page;
 *   • everything missing is fetched in ONE call covering the earliest missing
 *     day through now — a first view of a bike is one call, not seven.
 *
 * `vehicle_daily_activity` is not in the generated types, hence the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

const TODAY_TTL_MS = 3 * 3_600_000;
const WINDOW_DAYS = 7;

export interface ActivityDay {
    day: string;
    ignition_hours: number;
    moving_hours: number;
    trips: number;
    /** True once the day has ended — the figures will not change. */
    is_final: boolean;
    /** False when the bike reported nothing that day. */
    has_data: boolean;
}

export type VehicleActivity =
    | { available: false; reason: "not_configured" | "not_on_account" | "not_set_up" | "error"; message: string }
    | {
        available: true;
        today: string;
        /** Newest first: today, yesterday, … six days ago. */
        days: ActivityDay[];
        totals: { ignition_hours: number; moving_hours: number; trips: number };
        computed_at: string | null;
        /** Set when the figures shown could not be refreshed. */
        note: string | null;
    };

interface CacheRow {
    day: string;
    ignition_hours: number | string;
    moving_hours: number | string;
    trips: number;
    is_final: boolean;
    computed_at: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function plusDays(day: string, days: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

const dayStartMs = (day: string) => new Date(`${day}T00:00:00+05:30`).getTime();

const inFlight = new Map<string, Promise<VehicleActivity>>();

export function getVehicleActivity(vehicleId: string): Promise<VehicleActivity> {
    // Two people opening the same bike at once must not make two history calls.
    const running = inFlight.get(vehicleId);
    if (running) return running;
    const p = compute(vehicleId).finally(() => inFlight.delete(vehicleId));
    inFlight.set(vehicleId, p);
    return p;
}

function assemble(today: string, rows: Map<string, CacheRow>, note: string | null): VehicleActivity {
    const days: ActivityDay[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
        const day = plusDays(today, -i);
        const r = rows.get(day);
        days.push(r
            ? {
                day,
                ignition_hours: Number(r.ignition_hours),
                moving_hours: Number(r.moving_hours),
                trips: r.trips,
                is_final: r.is_final,
                has_data: Number(r.ignition_hours) > 0 || r.trips > 0,
            }
            : { day, ignition_hours: 0, moving_hours: 0, trips: 0, is_final: false, has_data: false });
    }
    const sum = (f: (d: ActivityDay) => number) => round2(days.reduce((s, d) => s + f(d), 0));
    const computedAt = [...rows.values()].map((r) => r.computed_at).sort().pop() ?? null;
    return {
        available: true,
        today,
        days,
        totals: {
            ignition_hours: sum((d) => d.ignition_hours),
            moving_hours: sum((d) => d.moving_hours),
            trips: days.reduce((s, d) => s + d.trips, 0),
        },
        computed_at: computedAt,
        note,
    };
}

async function compute(vehicleId: string): Promise<VehicleActivity> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, registration_number, vin")
        .eq("id", vehicleId)
        .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const today = businessToday();
    const firstDay = plusDays(today, -(WINDOW_DAYS - 1));

    const { data, error } = await db
        .from("vehicle_daily_activity")
        .select("day, ignition_hours, moving_hours, trips, is_final, computed_at")
        .eq("vehicle_id", vehicleId)
        .gte("day", firstDay)
        .lte("day", today);
    if (error) {
        // Without the cache table every view would call Intellicar. Refuse instead.
        console.warn("[telematics] vehicle_daily_activity unreadable", error.message);
        return { available: false, reason: "not_set_up", message: "Running hours are not set up yet (database update pending)." };
    }
    const cache = new Map<string, CacheRow>(((data ?? []) as CacheRow[]).map((r) => [r.day, r]));

    // Which days need a fresh calculation?
    const needed: string[] = [];
    for (let i = 0; i < WINDOW_DAYS; i++) {
        const day = plusDays(today, -i);
        const r = cache.get(day);
        if (!r) needed.push(day);
        else if (!r.is_final && day < today) needed.push(day); // a finished day not yet sealed
        else if (day === today && Date.now() - new Date(r.computed_at).getTime() > TODAY_TTL_MS) needed.push(day);
    }
    if (needed.length === 0) return assemble(today, cache, null);

    if (!intellicarConfigured()) {
        return cache.size > 0
            ? assemble(today, cache, "Showing saved figures — vehicle tracking is not connected.")
            : { available: false, reason: "not_configured", message: "Vehicle tracking is not connected yet." };
    }

    try {
        const vehicleNo = await resolveVehicleNo(vehicle.vin, vehicle.registration_number);
        if (!vehicleNo) {
            return { available: false, reason: "not_on_account", message: "This bike is not on the tracking account." };
        }

        const earliest = needed.reduce((a, b) => (a < b ? a : b));
        const readings = await getGpsHistory(vehicleNo, dayStartMs(earliest), Date.now());
        const computed = computeDailyActivity(readings);

        const nowIso = new Date().toISOString();
        const upserts = needed.map((day) => {
            const a = computed.get(day);
            return {
                vehicle_id: vehicleId,
                day,
                // clamp: a numeric(5,2) column must never reject a day over a rounding quirk
                ignition_hours: Math.min(24, a?.ignition_hours ?? 0),
                moving_hours: Math.min(24, a?.moving_hours ?? 0),
                trips: a?.trips ?? 0,
                // a day that has ended is sealed; today keeps refreshing
                is_final: day < today,
                computed_at: nowIso,
            };
        });
        const { error: saveError } = await db.from("vehicle_daily_activity").upsert(upserts, { onConflict: "vehicle_id,day" });
        if (saveError) throw saveError;

        for (const u of upserts) cache.set(u.day, { ...u, computed_at: nowIso });
        return assemble(today, cache, null);
    } catch (err) {
        // Saved figures beat an error when the platform is briefly unavailable or rate limited.
        if (cache.size > 0) {
            return assemble(today, cache, "Showing saved figures — could not refresh just now.");
        }
        return {
            available: false,
            reason: "error",
            message: err instanceof Error ? err.message : "Could not read the running hours.",
        };
    }
}
