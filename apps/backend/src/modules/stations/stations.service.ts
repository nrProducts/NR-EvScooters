import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { NearestStation } from "./stations.types";

/**
 * `stations` is `hubs` now, and `nearest_station` is `nearest_hub`.
 *
 * The rename is more than cosmetic: the old table conflated two things a hub
 * is not — a battery swap point is `swap_stations`, a separate table. A hub is
 * where a scooter is picked up and returned.
 *
 * The response keeps `lat`/`lng` rather than the function's `latitude`/
 * `longitude`, because the mobile map reads those names. One mapping here
 * beats a rename across the handset screens.
 */
export async function getNearestStation(lat: number, lng: number): Promise<NearestStation> {
    const { data, error } = await supabaseAdmin
        .rpc("nearest_hub", { p_lat: lat, p_lng: lng })
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No pickup station is available yet.");

    return {
        id: data.id,
        name: data.name,
        code: data.code,
        lat: data.latitude,
        lng: data.longitude,
        distance_km: data.distance_km,
    };
}
