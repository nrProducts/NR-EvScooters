import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import {
    ListVehicleModelsFilters, PlanSummary, VehicleImage, VehicleModelDetail,
    VehicleModelListItem, VendorSummary,
} from "./vehicle-catalog.types";

const LIST_COLUMNS = `
    id, name, category, tagline, battery_range_km, top_speed_kmph, charging_time_hours,
    is_featured, vendors(id, name, description, logo_url), vehicle_images(url, is_hero, sort_order),
    plans(price)
`;

const DETAIL_COLUMNS = `
    id, name, category, tagline, description, battery_range_km, top_speed_kmph, charging_time_hours,
    motor_power_watts, battery_capacity, features, safety_features, is_featured,
    vendors(id, name, description, logo_url),
    vehicle_images(id, url, alt_text, is_hero, sort_order),
    plans(id, name, billing_cycle, price, included_minutes)
`;

export type RawModelRow = {
    id: string;
    name: string;
    category: string;
    tagline: string | null;
    description?: string | null;
    battery_range_km: number | null;
    top_speed_kmph: number | null;
    charging_time_hours: number | null;
    motor_power_watts?: number | null;
    battery_capacity?: string | null;
    features?: string[] | null;
    safety_features?: string[] | null;
    is_featured: boolean;
    vendors: unknown;
    vehicle_images: unknown;
    plans: unknown;
};

function toVendorSummary(raw: unknown): VendorSummary | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v) return null;
    const row = v as { id: string; name: string; description: string | null; logo_url: string | null };
    return { id: row.id, name: row.name, description: row.description, logo_url: row.logo_url };
}

export function toImages(raw: unknown): VehicleImage[] {
    const rows = (Array.isArray(raw) ? raw : []) as Array<{
        id?: string; url: string; alt_text?: string | null; is_hero: boolean; sort_order: number;
    }>;
    return [...rows]
        .sort((a, b) => (a.is_hero === b.is_hero ? a.sort_order - b.sort_order : a.is_hero ? -1 : 1))
        .map((r) => ({
            id: r.id ?? "",
            url: r.url,
            alt_text: r.alt_text ?? null,
            is_hero: r.is_hero,
            sort_order: r.sort_order,
        }));
}

export function toPlans(raw: unknown): PlanSummary[] {
    const rows = (Array.isArray(raw) ? raw : []) as Array<{
        id?: string; name?: string; billing_cycle: PlanSummary["billing_cycle"]; price: number;
        included_minutes: number | null;
    }>;
    const order: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, yearly: 3 };
    return rows
        .map((r) => ({
            id: r.id ?? "",
            name: r.name ?? "",
            billing_cycle: r.billing_cycle,
            price: Number(r.price),
            included_minutes: r.included_minutes,
        }))
        .sort((a, b) => (order[a.billing_cycle] ?? 99) - (order[b.billing_cycle] ?? 99));
}

export function toListItem(row: RawModelRow): VehicleModelListItem {
    const images = toImages(row.vehicle_images);
    const hero = images.find((i) => i.is_hero) ?? images[0];
    const plans = toPlans(row.plans);
    const startingPrice = plans.length > 0 ? Math.min(...plans.map((p) => p.price)) : null;

    return {
        id: row.id,
        name: row.name,
        category: row.category as VehicleModelListItem["category"],
        tagline: row.tagline,
        battery_range_km: row.battery_range_km,
        top_speed_kmph: row.top_speed_kmph,
        charging_time_hours: row.charging_time_hours,
        is_featured: row.is_featured,
        vendor: toVendorSummary(row.vendors),
        hero_image_url: hero?.url ?? null,
        starting_price: startingPrice,
    };
}

export async function listVehicleModels(
    filters: ListVehicleModelsFilters,
): Promise<Paginated<VehicleModelListItem>> {
    let query = supabaseAdmin
        .from("vehicle_models")
        .select(LIST_COLUMNS, { count: "exact" })
        .eq("active", true);

    if (filters.category) query = query.eq("category", filters.category);
    if (filters.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters.search) query = query.ilike("name", `%${escapeLike(filters.search)}%`);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const items = ((data ?? []) as unknown as RawModelRow[]).map(toListItem);
    return paginate(items, count ?? 0, filters);
}

export async function getFeaturedVehicleModel(): Promise<VehicleModelListItem> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_models")
        .select(LIST_COLUMNS)
        .eq("active", true)
        .eq("is_featured", true)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No featured scooter is configured yet.");

    return toListItem(data as unknown as RawModelRow);
}

export async function getVehicleModelById(id: string): Promise<VehicleModelDetail> {
    const [{ data, error }, availability] = await Promise.all([
        supabaseAdmin
            .from("vehicle_models")
            .select(DETAIL_COLUMNS)
            .eq("id", id)
            .eq("active", true)
            .maybeSingle(),
        getAvailabilityForModel(id),
    ]);

    if (error) throw error;
    if (!data) throw notFound("This scooter model could not be found.");

    const row = data as unknown as RawModelRow;
    const listItem = toListItem(row);

    return {
        ...listItem,
        description: row.description ?? null,
        motor_power_watts: row.motor_power_watts ?? null,
        battery_capacity: row.battery_capacity ?? null,
        features: (row.features as string[] | null) ?? [],
        safety_features: (row.safety_features as string[] | null) ?? [],
        images: toImages(row.vehicle_images),
        plans: toPlans(row.plans),
        availability,
    };
}

export async function getAvailabilityForModel(
    id: string,
    stationId?: string,
): Promise<{ available_count: number; status: "available" | "unavailable" }> {
    let query = supabaseAdmin
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("model_id", id)
        .eq("status", "available")
        .eq("active", true);

    if (stationId) query = query.eq("station_id", stationId);

    const { count, error } = await query;

    if (error) throw error;
    return toAvailability(count ?? 0);
}

export function toAvailability(
    availableCount: number,
): { available_count: number; status: "available" | "unavailable" } {
    return { available_count: availableCount, status: availableCount > 0 ? "available" : "unavailable" };
}

/** PostgREST treats % and _ as wildcards inside ilike patterns. */
function escapeLike(input: string): string {
    return input.replace(/[%_\\,()]/g, "");
}
