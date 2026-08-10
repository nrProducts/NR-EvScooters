import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { haversineKm } from "../../common/geo";
import { AuthContext, Paginated } from "../../types";
import {
    AdminStationFilters, BatteryStation, BatteryStationRow, BatteryStationSummary,
    CreateBatteryStationInput, MobileStationFilters, UpdateBatteryStationInput,
} from "./battery-stations.types";

/**
 * ⚠️ Every field on BatteryStationRow must appear here — the select is an
 * untyped template string and the result is cast, so a column added to the
 * interface but missing from this list compiles clean and returns undefined.
 */
const STATION_COLUMNS = `
    id, serial_number, qis_ids, name, latitude, longitude, status, battery_count,
    is_visible_on_mobile, deleted_at, created_at, updated_at, created_by, updated_by
`;

/** The one place a DB row becomes the public camelCase contract. */
export function toBatteryStation(row: BatteryStationRow): BatteryStation {
    const station: BatteryStation = {
        id: row.id,
        serialNumber: row.serial_number,
        qisIds: row.qis_ids ?? [],
        name: row.name,
        latitude: row.latitude,
        longitude: row.longitude,
        status: row.status,
        batteryCount: row.battery_count,
        isVisibleOnMobile: row.is_visible_on_mobile,
        isDeleted: row.deleted_at !== null,
        createdAt: row.created_at,
        // The trigger leaves updated_at null until the first edit; clients
        // sort and render "last updated", so fall back to created_at rather
        // than making every consumer handle null.
        updatedAt: row.updated_at ?? row.created_at,
    };
    if (row.created_by) station.createdBy = row.created_by;
    if (row.updated_by) station.updatedBy = row.updated_by;
    return station;
}

/**
 * PostgREST's `or=(...)` is comma-separated and paren-delimited, so those
 * characters in a user's search term would be parsed as filter syntax.
 * Stripping them is safe here: no station name or QIS id contains one.
 */
function sanitiseSearch(term: string): string {
    return term.replace(/[,()"\\*%]/g, " ").trim();
}

function searchFilter(term: string): string {
    const safe = sanitiseSearch(term);
    return `name.ilike.%${safe}%,qis_ids_text.ilike.%${safe}%`;
}

// -------------------------------------------------------------------------
// Mobile / rider reads
// -------------------------------------------------------------------------

/**
 * Riders see live + visible stations only. Admins calling the same endpoint
 * see hidden stations too (still never soft-deleted ones), so the console can
 * preview exactly what a change will do without a second endpoint.
 */
export async function listStationsForMobile(
    filters: MobileStationFilters,
    isAdminCaller: boolean,
): Promise<BatteryStation[]> {
    let query = supabaseAdmin
        .from("battery_stations")
        .select(STATION_COLUMNS)
        .is("deleted_at", null);

    if (!isAdminCaller) query = query.eq("is_visible_on_mobile", true);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) query = query.or(searchFilter(filters.search));

    // A bounding box narrows the scan before the exact Haversine pass below.
    // Degrees of longitude shrink towards the poles, hence the cos(lat)
    // widening; clamped so a radius spanning a pole can't produce a box that
    // excludes valid rows.
    if (filters.latitude !== undefined && filters.longitude !== undefined && filters.radiusKm !== undefined) {
        const latDelta = filters.radiusKm / 111.32;
        const cosLat = Math.max(0.01, Math.cos((filters.latitude * Math.PI) / 180));
        const lngDelta = Math.min(180, filters.radiusKm / (111.32 * cosLat));
        query = query
            .gte("latitude", filters.latitude - latDelta)
            .lte("latitude", filters.latitude + latDelta)
            .gte("longitude", filters.longitude - lngDelta)
            .lte("longitude", filters.longitude + lngDelta);
    }

    const { data, error } = await query.order("serial_number", { ascending: true });
    if (error) throw error;

    let stations = ((data ?? []) as unknown as BatteryStationRow[]).map(toBatteryStation);

    if (filters.latitude !== undefined && filters.longitude !== undefined) {
        const origin = { latitude: filters.latitude, longitude: filters.longitude };
        stations = stations.map((s) => ({
            ...s,
            distanceKm: haversineKm(origin, { latitude: s.latitude, longitude: s.longitude }),
        }));

        // The bounding box above is a rectangle; this is the actual circle.
        if (filters.radiusKm !== undefined) {
            stations = stations.filter((s) => (s.distanceKm ?? Infinity) <= filters.radiusKm!);
        }
        stations.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    }

    return stations;
}

export async function getStationById(id: string, isAdminCaller: boolean): Promise<BatteryStation> {
    let query = supabaseAdmin
        .from("battery_stations")
        .select(STATION_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null);

    if (!isAdminCaller) query = query.eq("is_visible_on_mobile", true);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    // Deliberately the same 404 a non-existent id gets: a rider must not be
    // able to probe which ids exist but are hidden.
    if (!data) throw notFound("That battery station is not available.");

    return toBatteryStation(data as unknown as BatteryStationRow);
}

// -------------------------------------------------------------------------
// Admin reads
// -------------------------------------------------------------------------

const SORT_COLUMNS: Record<AdminStationFilters["sortBy"], string> = {
    name: "name",
    batteryCount: "battery_count",
    updatedAt: "updated_at",
    serialNumber: "serial_number",
};

export async function listStationsForAdmin(
    filters: AdminStationFilters,
): Promise<Paginated<BatteryStation>> {
    let query = supabaseAdmin
        .from("battery_stations")
        .select(STATION_COLUMNS, { count: "exact" })
        .is("deleted_at", null);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.visibility) query = query.eq("is_visible_on_mobile", filters.visibility === "visible");
    if (filters.search) query = query.or(searchFilter(filters.search));

    const [from, to] = toRange(filters);
    const { data, error, count } = await query
        .order(SORT_COLUMNS[filters.sortBy], {
            ascending: filters.sortDir === "asc",
            // updated_at is null until a row's first edit; without this those
            // rows sort to the top of a "newest first" list.
            nullsFirst: false,
        })
        .range(from, to);

    if (error) throw error;

    const stations = ((data ?? []) as unknown as BatteryStationRow[]).map(toBatteryStation);
    return paginate(stations, count ?? 0, filters);
}

/** Powers the four summary cards. Counts live rows only. */
export async function getStationSummary(): Promise<BatteryStationSummary> {
    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .select("status, battery_count, is_visible_on_mobile")
        .is("deleted_at", null);

    if (error) throw error;

    const rows = (data ?? []) as { status: BatteryStationRow["status"]; battery_count: number; is_visible_on_mobile: boolean }[];
    const countBy = (status: BatteryStationRow["status"]) => rows.filter((r) => r.status === status).length;

    const maintenanceStations = countBy("MAINTENANCE");
    const notWorkingStations = countBy("NOT_WORKING");

    return {
        totalStations: rows.length,
        workingStations: countBy("WORKING"),
        maintenanceStations,
        notWorkingStations,
        attentionStations: maintenanceStations + notWorkingStations,
        hiddenStations: rows.filter((r) => !r.is_visible_on_mobile).length,
        totalBatteries: rows.reduce((sum, r) => sum + (r.battery_count ?? 0), 0),
    };
}

// -------------------------------------------------------------------------
// Admin writes
// -------------------------------------------------------------------------

/**
 * A QIS id identifies one physical cabinet, so it may appear at exactly one
 * live station. Checked here (rather than only via the DB's uniqueness index)
 * so the admin gets a field-level message naming the clashing station instead
 * of an opaque 500.
 */
async function assertQisIdsFree(qisIds: string[], excludeStationId?: string): Promise<void> {
    let query = supabaseAdmin
        .from("battery_stations")
        .select("id, name, qis_ids")
        .is("deleted_at", null)
        .overlaps("qis_ids", qisIds);

    if (excludeStationId) query = query.neq("id", excludeStationId);

    const { data, error } = await query;
    if (error) throw error;

    const clash = (data ?? []) as { id: string; name: string; qis_ids: string[] }[];
    if (clash.length === 0) return;

    const taken = clash
        .flatMap((row) => row.qis_ids.filter((id) => qisIds.includes(id)))
        .join(", ");

    throw conflict(`${taken} is already registered to "${clash[0].name}".`, {
        qisIds: `${taken} is already registered to another station.`,
    });
}

/**
 * ILIKE treats % and _ as wildcards, and seeded names contain underscores
 * ("Mogappaire_Hub"), so an unescaped pattern would match names that merely
 * look alike. Backslash is Postgres' default LIKE escape character.
 */
const escapeLikePattern = (value: string): string => value.replace(/([%_\\])/g, "\\$1");

/** Guards against the double-submitted Add form, not against similar names. */
async function assertNameFree(name: string, excludeStationId?: string): Promise<void> {
    let query = supabaseAdmin
        .from("battery_stations")
        .select("id")
        .is("deleted_at", null)
        .ilike("name", escapeLikePattern(name));

    if (excludeStationId) query = query.neq("id", excludeStationId);

    const { data, error } = await query.limit(1);
    if (error) throw error;
    if ((data ?? []).length > 0) {
        throw conflict("A station with that name already exists.", {
            name: "A station with that name already exists.",
        });
    }
}

async function nextSerialNumber(): Promise<number> {
    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .select("serial_number")
        .order("serial_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return ((data?.serial_number as number | undefined) ?? 0) + 1;
}

export async function createStation(
    input: CreateBatteryStationInput,
    actor: AuthContext,
    req?: Request,
): Promise<BatteryStation> {
    await assertNameFree(input.name);
    await assertQisIdsFree(input.qisIds);

    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .insert({
            serial_number: input.serialNumber ?? (await nextSerialNumber()),
            qis_ids: input.qisIds,
            name: input.name,
            latitude: input.latitude,
            longitude: input.longitude,
            status: input.status ?? "WORKING",
            battery_count: input.batteryCount,
            is_visible_on_mobile: input.isVisibleOnMobile ?? true,
            created_by: actor.id,
            updated_by: actor.id,
        })
        .select(STATION_COLUMNS)
        .single();

    if (error) throw error;

    const station = toBatteryStation(data as unknown as BatteryStationRow);
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "battery_station.created",
        entityType: "battery_station",
        entityId: station.id,
        after: station as unknown as Record<string, unknown>,
        req,
    });
    return station;
}

/** Shared by PUT and PATCH — both are full-object-tolerant partial updates. */
export async function updateStation(
    id: string,
    patch: UpdateBatteryStationInput,
    actor: AuthContext,
    req?: Request,
): Promise<BatteryStation> {
    const before = await requireLiveStation(id);

    if (patch.name && patch.name !== before.name) await assertNameFree(patch.name, id);
    if (patch.qisIds) await assertQisIdsFree(patch.qisIds, id);

    const update: Record<string, unknown> = { updated_by: actor.id };
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.qisIds !== undefined) update.qis_ids = patch.qisIds;
    if (patch.latitude !== undefined) update.latitude = patch.latitude;
    if (patch.longitude !== undefined) update.longitude = patch.longitude;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.batteryCount !== undefined) update.battery_count = patch.batteryCount;
    if (patch.isVisibleOnMobile !== undefined) update.is_visible_on_mobile = patch.isVisibleOnMobile;
    if (patch.serialNumber !== undefined) update.serial_number = patch.serialNumber;

    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .update(update)
        .eq("id", id)
        .is("deleted_at", null)
        .select(STATION_COLUMNS)
        .single();

    if (error) throw error;

    const station = toBatteryStation(data as unknown as BatteryStationRow);
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "battery_station.updated",
        entityType: "battery_station",
        entityId: id,
        before: before as unknown as Record<string, unknown>,
        after: station as unknown as Record<string, unknown>,
        req,
    });
    return station;
}

export async function setStationVisibility(
    id: string,
    isVisibleOnMobile: boolean,
    actor: AuthContext,
    req?: Request,
): Promise<BatteryStation> {
    const before = await requireLiveStation(id);

    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .update({ is_visible_on_mobile: isVisibleOnMobile, updated_by: actor.id })
        .eq("id", id)
        .is("deleted_at", null)
        .select(STATION_COLUMNS)
        .single();

    if (error) throw error;

    const station = toBatteryStation(data as unknown as BatteryStationRow);
    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: isVisibleOnMobile ? "battery_station.shown" : "battery_station.hidden",
        entityType: "battery_station",
        entityId: id,
        before: { isVisibleOnMobile: before.isVisibleOnMobile },
        after: { isVisibleOnMobile: station.isVisibleOnMobile },
        req,
    });
    return station;
}

/**
 * Soft delete: the row survives (audit trail, and the QIS ids it held stay
 * traceable), but it leaves every API response — mobile and admin alike.
 */
export async function softDeleteStation(
    id: string,
    actor: AuthContext,
    req?: Request,
): Promise<void> {
    const before = await requireLiveStation(id);

    const { error } = await supabaseAdmin
        .from("battery_stations")
        .update({ deleted_at: new Date().toISOString(), updated_by: actor.id })
        .eq("id", id)
        .is("deleted_at", null);

    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "battery_station.soft_deleted",
        entityType: "battery_station",
        entityId: id,
        before: before as unknown as Record<string, unknown>,
        req,
    });
}

async function requireLiveStation(id: string): Promise<BatteryStation> {
    const { data, error } = await supabaseAdmin
        .from("battery_stations")
        .select(STATION_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("That battery station no longer exists.");
    return toBatteryStation(data as unknown as BatteryStationRow);
}
