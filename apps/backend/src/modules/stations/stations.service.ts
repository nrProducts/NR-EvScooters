import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { NearestStation } from "./stations.types";

export async function getNearestStation(lat: number, lng: number): Promise<NearestStation> {
    const { data, error } = await supabaseAdmin
        .rpc("nearest_station", { p_lat: lat, p_lng: lng })
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No pickup station is available yet.");

    return data as unknown as NearestStation;
}
