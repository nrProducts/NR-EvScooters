import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import {
    ListVehicleModelsFilters, PlanSummary, VehicleModelDetail,
    VehicleModelListItem, VendorSummary,
} from "./vehicle-catalog.types";

/**
 * Four renames run through this whole file:
 *
 *   `active`             → `is_active`   (models, plans, vendors)
 *   `plans.price`        → `price_amount`
 *   `plans.billing_cycle`→ `billing_period`
 *   `vehicles.model_id`  → `vehicle_model_id`, `station_id` → `hub_id`
 *
 * And one that is not a rename: `vehicle_models.image` is gone. A model has a
 * gallery now — `vehicle_model_media`, ordered, with one row flagged primary —
 * so the single text column became an embed, and what it holds is a private
 * storage path rather than a public URL.
 *
 * `vehicles.active` has no successor at all. A vehicle that is out of service
 * is `status = 'retired'` or `'maintenance'`, and `recompute_vehicle_status()`
 * owns that column; a separate boolean was a second source of truth for the
 * same fact.
 */

const MEDIA_EMBED = "vehicle_model_media(storage_path, is_primary, sort_order)";

const LIST_COLUMNS = `
    id, name, category, tagline, battery_range_km, top_speed_kmph, charging_time_hours,
    is_featured, ${MEDIA_EMBED},
    vendors(id, name, description, logo_storage_path),
    plans(price_amount)
`;

const DETAIL_COLUMNS = `
    id, name, category, tagline, description, battery_range_km, top_speed_kmph, charging_time_hours,
    motor_power_watts, battery_capacity, features, safety_features, is_featured, ${MEDIA_EMBED},
    vendors(id, name, description, logo_storage_path),
    plans(id, name, billing_period, price_amount, duration_days, deposit_amount)
`;

/**
 * Retired pricing must never be bookable, and must never set starting_price
 * either. PostgREST filters the embedded rows here rather than dropping the
 * parent (that would need plans!inner), so a model whose plans are all
 * inactive still lists — it just has no price and nothing to choose.
 */
const ACTIVE_PLANS_ONLY = "plans.is_active";

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
    features?: unknown;
    safety_features?: unknown;
    is_featured: boolean;
    vehicle_model_media: unknown;
    vendors: unknown;
    plans: unknown;
};

function toVendorSummary(raw: unknown): VendorSummary | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v) return null;
    const row = v as { id: string; name: string; description: string | null; logo_storage_path: string | null };
    return { id: row.id, name: row.name, description: row.description, logo_url: row.logo_storage_path };
}

/**
 * The model's hero image: the row flagged primary, else the lowest sort_order.
 *
 * Returns a storage path, not a URL — the field is still called `image_url` on
 * the wire so neither app has to change, but a caller that needs bytes has to
 * mint a signed URL, exactly as it does for a KYC document.
 */
function toPrimaryImage(raw: unknown): string | null {
    const rows = (Array.isArray(raw) ? raw : []) as Array<{
        storage_path: string; is_primary: boolean; sort_order: number;
    }>;
    if (rows.length === 0) return null;
    const primary = rows.find((m) => m.is_primary);
    if (primary) return primary.storage_path;
    return [...rows].sort((a, b) => a.sort_order - b.sort_order)[0].storage_path;
}

/**
 * `features` and `safety_features` are `jsonb` now rather than `text[]`.
 * Anything that is not an array of strings is treated as absent rather than
 * crashing a product page over a malformed row.
 */
function toStringArray(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((v): v is string => typeof v === "string");
}

export function toPlans(raw: unknown): PlanSummary[] {
    const rows = (Array.isArray(raw) ? raw : []) as Array<{
        id?: string; name?: string; billing_period: PlanSummary["billing_cycle"];
        price_amount: number; duration_days?: number; deposit_amount?: number;
    }>;
    const order: Record<string, number> = { daily: 0, weekly: 1, monthly: 2, yearly: 3 };
    return rows
        .map((r) => ({
            id: r.id ?? "",
            name: r.name ?? "",
            billing_cycle: r.billing_period,
            price: Number(r.price_amount),
            // `included_minutes` has no column in the new schema — the plans
            // are unlimited-use subscriptions, and nothing ever wrote it.
            // Kept on the wire as a constant null so neither app breaks.
            included_minutes: null,
            duration_days: Number(r.duration_days ?? 0),
            deposit_amount: Number(r.deposit_amount ?? 0),
        }))
        .sort((a, b) => (order[a.billing_cycle] ?? 99) - (order[b.billing_cycle] ?? 99));
}

export function toListItem(row: RawModelRow, availableCount = 0): VehicleModelListItem {
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
        image_url: toPrimaryImage(row.vehicle_model_media),
        starting_price: startingPrice,
        availability: toAvailability(availableCount),
    };
}

/**
 * One query for however many models are on the current page — avoids N+1.
 *
 * `v_vehicle_availability` does the grouping in the database, so this returns
 * one row per (model, hub, status) rather than one per vehicle. The old
 * version pulled every available vehicle row back and counted them in JS.
 */
async function getAvailableCountsForModels(modelIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (modelIds.length === 0) return counts;

    const { data, error } = await supabaseAdmin
        .from("v_vehicle_availability")
        .select("vehicle_model_id, vehicle_count")
        .in("vehicle_model_id", modelIds)
        .eq("status", "available");
    if (error) throw error;

    for (const row of data ?? []) {
        if (!row.vehicle_model_id) continue;
        counts.set(
            row.vehicle_model_id,
            (counts.get(row.vehicle_model_id) ?? 0) + (row.vehicle_count ?? 0),
        );
    }
    return counts;
}

export async function listVehicleModels(
    filters: ListVehicleModelsFilters,
): Promise<Paginated<VehicleModelListItem>> {
    let query = supabaseAdmin
        .from("vehicle_models")
        .select(LIST_COLUMNS, { count: "exact" })
        .eq("is_active", true)
        .is("deleted_at", null)
        .eq(ACTIVE_PLANS_ONLY, true);

    if (filters.category) query = query.eq("category", filters.category);
    if (filters.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters.search) query = query.ilike("name", `%${escapeLike(filters.search)}%`);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawModelRow[];
    const counts = await getAvailableCountsForModels(rows.map((r) => r.id));
    const items = rows.map((row) => toListItem(row, counts.get(row.id) ?? 0));
    return paginate(items, count ?? 0, filters);
}

export async function getFeaturedVehicleModel(): Promise<VehicleModelListItem> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_models")
        .select(LIST_COLUMNS)
        .eq("is_active", true)
        .is("deleted_at", null)
        .eq(ACTIVE_PLANS_ONLY, true)
        .eq("is_featured", true)
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No featured scooter is configured yet.");

    const row = data as unknown as RawModelRow;
    const counts = await getAvailableCountsForModels([row.id]);
    return toListItem(row, counts.get(row.id) ?? 0);
}

export async function getVehicleModelById(id: string): Promise<VehicleModelDetail> {
    const [{ data, error }, availability] = await Promise.all([
        supabaseAdmin
            .from("vehicle_models")
            .select(DETAIL_COLUMNS)
            .eq("id", id)
            .eq("is_active", true)
            .is("deleted_at", null)
            .eq(ACTIVE_PLANS_ONLY, true)
            .maybeSingle(),
        getAvailabilityForModel(id),
    ]);

    if (error) throw error;
    if (!data) throw notFound("This scooter model could not be found.");

    const row = data as unknown as RawModelRow;
    const listItem = toListItem(row, availability.available_count);

    return {
        ...listItem,
        description: row.description ?? null,
        motor_power_watts: row.motor_power_watts ?? null,
        battery_capacity: row.battery_capacity ?? null,
        features: toStringArray(row.features),
        safety_features: toStringArray(row.safety_features),
        plans: toPlans(row.plans),
    };
}

export async function getAvailabilityForModel(
    id: string,
    hubId?: string,
): Promise<{ available_count: number; status: "available" | "unavailable" }> {
    let query = supabaseAdmin
        .from("v_vehicle_availability")
        .select("vehicle_count")
        .eq("vehicle_model_id", id)
        .eq("status", "available");

    if (hubId) query = query.eq("hub_id", hubId);

    const { data, error } = await query;
    if (error) throw error;

    const total = (data ?? []).reduce((sum, row) => sum + (row.vehicle_count ?? 0), 0);
    return toAvailability(total);
}

export async function getFleetAvailabilitySummary(): Promise<{ available_count: number }> {
    const { data, error } = await supabaseAdmin
        .from("v_vehicle_availability")
        .select("vehicle_count")
        .eq("status", "available");

    if (error) throw error;
    return { available_count: (data ?? []).reduce((sum, row) => sum + (row.vehicle_count ?? 0), 0) };
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
