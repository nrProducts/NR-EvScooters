import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { getDistanceTravelled, intellicarConfigured, resolveVehicleNo } from "./intellicar.client";

/**
 * Distance covered during a rental.
 *
 * Fetched from Intellicar's odometer once a rental has ended (it can never
 * change, so it is stored as final) and at most every 2 hours while one is
 * running — the platform allows only 24 history calls per vehicle per day.
 * A rental that used more than one scooter (a maintenance swap) is measured
 * per scooter, over the window each one was assigned, and summed.
 *
 * `rental_distance` is not in the generated types yet, hence the untyped
 * client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

const RUNNING_TTL_MS = 2 * 3_600_000;
const GAP_MS = 450;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface DistanceSegment {
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
        segments: DistanceSegment[];
        /** True once the rental has ended — the figure will not change. */
        is_final: boolean;
        computed_at: string;
    };

interface CacheRow {
    distance_km: number | string;
    start_odo: number | string | null;
    end_odo: number | string | null;
    segments: DistanceSegment[];
    is_final: boolean;
    computed_at: string;
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const round2 = (n: number) => Math.round(n * 100) / 100;

function fromCache(row: CacheRow): RentalDistance {
    return {
        available: true,
        distance_km: Number(row.distance_km),
        start_odo: numOrNull(row.start_odo),
        end_odo: numOrNull(row.end_odo),
        segments: row.segments ?? [],
        is_final: row.is_final,
        computed_at: row.computed_at,
    };
}

export async function getRentalDistance(rentalId: string, opts: { refresh?: boolean } = {}): Promise<RentalDistance> {
    const { data: rental, error } = await supabaseAdmin
        .from("rentals")
        .select(`
            id, picked_up_at, returned_at,
            rental_vehicle_assignments(assigned_at, released_at, vehicles(registration_number, vin))
        `)
        .eq("id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!rental) throw notFound("Rental not found.");

    const { data: cachedRow, error: cacheError } = await db
        .from("rental_distance")
        .select("distance_km, start_odo, end_odo, segments, is_final, computed_at")
        .eq("rental_id", rentalId)
        .maybeSingle();
    // A cache that cannot be read (table not migrated yet, brief DB error) just
    // means "fetch it" — the distance card must not fail because of it.
    if (cacheError) console.warn("[telematics] rental_distance cache unreadable", cacheError.message);
    const cached = cacheError ? null : (cachedRow as CacheRow | null);

    if (cached) {
        const fresh = cached.is_final || Date.now() - new Date(cached.computed_at).getTime() < RUNNING_TTL_MS;
        if (fresh && !(opts.refresh && !cached.is_final)) return fromCache(cached);
    }

    if (!intellicarConfigured()) {
        return cached
            ? fromCache(cached)
            : { available: false, reason: "not_configured", message: "Vehicle tracking is not connected yet." };
    }

    const ended = !!rental.returned_at;
    const rentalEnd = rental.returned_at ? new Date(rental.returned_at).getTime() : Date.now();

    const assignments = (rental.rental_vehicle_assignments ?? []) as unknown as {
        assigned_at: string; released_at: string | null; vehicles: unknown;
    }[];
    const windows = assignments
        .map((a) => {
            const v = (Array.isArray(a.vehicles) ? a.vehicles[0] : a.vehicles) as { registration_number: string; vin: string | null } | null;
            return {
                reg: v?.registration_number ?? null,
                vin: v?.vin ?? null,
                from: new Date(a.assigned_at).getTime(),
                to: Math.min(a.released_at ? new Date(a.released_at).getTime() : rentalEnd, rentalEnd),
            };
        })
        .filter((w): w is { reg: string; vin: string | null; from: number; to: number } => !!w.reg && w.to > w.from)
        .sort((a, b) => a.from - b.from);

    if (windows.length === 0) {
        return { available: false, reason: "no_vehicle", message: "No scooter was assigned to this rental." };
    }

    try {
        const segments: DistanceSegment[] = [];
        for (const [i, w] of windows.entries()) {
            if (i > 0) await sleep(GAP_MS);
            const vehicleNo = await resolveVehicleNo(w.vin, w.reg);
            if (!vehicleNo) throw new Error(`${w.reg} is not on the tracking account, so its distance cannot be read.`);
            const r = await getDistanceTravelled(vehicleNo, w.from, w.to);
            segments.push({
                registration_number: w.reg,
                from: new Date(w.from).toISOString(),
                to: new Date(w.to).toISOString(),
                distance_km: r.distance === null ? null : round2(r.distance),
                start_odo: r.startOdo,
                end_odo: r.endOdo,
            });
        }

        const total = round2(segments.reduce((s, seg) => s + (seg.distance_km ?? 0), 0));
        const row = {
            rental_id: rentalId,
            distance_km: total,
            start_odo: segments[0]?.start_odo ?? null,
            end_odo: segments[segments.length - 1]?.end_odo ?? null,
            segments,
            is_final: ended,
            computed_at: new Date().toISOString(),
        };
        const { error: saveError } = await db.from("rental_distance").upsert(row, { onConflict: "rental_id" });
        if (saveError) throw saveError;

        return {
            available: true,
            distance_km: total,
            start_odo: row.start_odo,
            end_odo: row.end_odo,
            segments,
            is_final: ended,
            computed_at: row.computed_at,
        };
    } catch (err) {
        // A stale figure beats no figure when the platform is briefly down.
        if (cached) return fromCache(cached);
        return {
            available: false,
            reason: "error",
            message: err instanceof Error ? err.message : "Could not read the distance.",
        };
    }
}
