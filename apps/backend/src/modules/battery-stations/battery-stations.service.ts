import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { haversineKm } from "../../common/geo";
import { AuthContext, Paginated } from "../../types";
import {
    AdminStationFilters, BatteryStation, BatteryStationRow, BatteryStationStatus,
    BatteryStationSummary, CreateBatteryStationInput, MobileStationFilters,
    UpdateBatteryStationInput,
} from "./battery-stations.types";

/**
 * Battery swap points — `swap_stations`, formerly `battery_stations`.
 *
 * The camelCase wire contract is unchanged: it is shared verbatim with both
 * clients (see the note in battery-stations.types.ts), and this file remains
 * the single translation point. What changed underneath:
 *
 *   `is_visible_on_mobile` → `is_rider_visible`
 *   `created_by`/`updated_by` → `created_by_user_id`/`updated_by_user_id`
 *   status values are lowercase in the enum (`working`), uppercase on the
 *     wire (`WORKING`) — mapped here rather than migrating both clients
 *
 * Two changes are structural rather than cosmetic:
 *
 *   **QIS ids are rows.** The old schema stored the same list three ways: a
 *   `text[]`, a denormalised `qis_ids_text` for LIKE matching, and a
 *   trigger-maintained index table — each one a workaround for a limitation
 *   of the last. There is one child table now, `swap_station_qis_ids`, with a
 *   unique constraint doing what the trigger used to. Global uniqueness is
 *   enforced by the database, so `assertQisIdsFree` exists purely to turn
 *   23505 into a message naming the station that already holds the id.
 *
 *   **Position is PostGIS.** `latitude`/`longitude` are generated columns off
 *   a `geography(Point,4326)`, so they can be read and filtered but not
 *   written; a write sends EWKT to `location` instead.
 */

const STATION_COLUMNS = `
    id, serial_number, code, name, latitude, longitude, status, battery_count,
    is_rider_visible, deleted_at, created_at, updated_at,
    created_by_user_id, updated_by_user_id,
    swap_station_qis_ids(qis_id)
`;

/** Raw shape of the select above, before translation. */
interface RawStationRow {
    id: string;
    serial_number: number;
    code: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    status: "working" | "not_working" | "maintenance";
    battery_count: number;
    is_rider_visible: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string | null;
    created_by_user_id: string | null;
    updated_by_user_id: string | null;
    swap_station_qis_ids: unknown;
}

const STATUS_TO_WIRE: Record<RawStationRow["status"], BatteryStationStatus> = {
    working: "WORKING",
    not_working: "NOT_WORKING",
    maintenance: "MAINTENANCE",
};

const STATUS_TO_DB: Record<BatteryStationStatus, RawStationRow["status"]> = {
    WORKING: "working",
    NOT_WORKING: "not_working",
    MAINTENANCE: "maintenance",
};

/** `POINT(lng lat)` — longitude first, which is the opposite of how it reads. */
const toEwkt = (latitude: number, longitude: number): string =>
    `SRID=4326;POINT(${longitude} ${latitude})`;

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

/** Flattens the embed and the enum casing into the shape toBatteryStation reads. */
function toRow(raw: RawStationRow): BatteryStationRow {
    const qis = (Array.isArray(raw.swap_station_qis_ids) ? raw.swap_station_qis_ids : []) as Array<{
        qis_id: string;
    }>;
    return {
        id: raw.id,
        serial_number: raw.serial_number,
        qis_ids: qis.map((q) => q.qis_id).sort(),
        name: raw.name,
        // Generated from `location`, which is NOT NULL, so these are never
        // actually null — the generated types cannot express that.
        latitude: raw.latitude ?? 0,
        longitude: raw.longitude ?? 0,
        status: STATUS_TO_WIRE[raw.status],
        battery_count: raw.battery_count,
        is_visible_on_mobile: raw.is_rider_visible,
        deleted_at: raw.deleted_at,
        created_at: raw.created_at,
        updated_at: raw.updated_at,
        created_by: raw.created_by_user_id,
        updated_by: raw.updated_by_user_id,
    };
}

const mapRows = (data: unknown): BatteryStation[] =>
    ((data ?? []) as unknown as RawStationRow[]).map((r) => toBatteryStation(toRow(r)));

/**
 * PostgREST's `or=(...)` is comma-separated and paren-delimited, so those
 * characters in a user's search term would be parsed as filter syntax.
 * Stripping them is safe here: no station name or QIS id contains one.
 */
function sanitiseSearch(term: string): string {
    return term.replace(/[,()"\\*%]/g, " ").trim();
}

/**
 * Station ids whose QIS list matches the search term.
 *
 * A separate query because the ids are a child table now — `or` cannot reach
 * across an embed, and the `qis_ids_text` column that existed solely to make
 * this one LIKE work is gone.
 */
async function stationIdsMatchingQis(term: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("swap_station_qis_ids")
        .select("swap_station_id")
        .ilike("qis_id", `%${sanitiseSearch(term)}%`);
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.swap_station_id))];
}

/** `name ILIKE term OR id IN (stations holding a matching QIS id)`. */
async function searchFilter(term: string): Promise<string> {
    const safe = sanitiseSearch(term);
    const ids = await stationIdsMatchingQis(term);
    const clauses = [`name.ilike.%${safe}%`];
    if (ids.length > 0) clauses.push(`id.in.(${ids.join(",")})`);
    return clauses.join(",");
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
        .from("swap_stations")
        .select(STATION_COLUMNS)
        .is("deleted_at", null);

    if (!isAdminCaller) query = query.eq("is_rider_visible", true);
    if (filters.status) query = query.eq("status", STATUS_TO_DB[filters.status]);
    if (filters.search) query = query.or(await searchFilter(filters.search));

    // A bounding box narrows the scan before the exact Haversine pass below.
    // Degrees of longitude shrink towards the poles, hence the cos(lat)
    // widening; clamped so a radius spanning a pole can't produce a box that
    // excludes valid rows. The lat/lng columns are generated from `location`
    // and indexed, so filtering them still works exactly as before.
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

    let stations = mapRows(data);

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
        .from("swap_stations")
        .select(STATION_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null);

    if (!isAdminCaller) query = query.eq("is_rider_visible", true);

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    // Deliberately the same 404 a non-existent id gets: a rider must not be
    // able to probe which ids exist but are hidden.
    if (!data) throw notFound("That battery station is not available.");

    return toBatteryStation(toRow(data as unknown as RawStationRow));
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
        .from("swap_stations")
        .select(STATION_COLUMNS, { count: "exact" })
        .is("deleted_at", null);

    if (filters.status) query = query.eq("status", STATUS_TO_DB[filters.status]);
    if (filters.visibility) query = query.eq("is_rider_visible", filters.visibility === "visible");
    if (filters.search) query = query.or(await searchFilter(filters.search));

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

    return paginate(mapRows(data), count ?? 0, filters);
}

/** Powers the four summary cards. Counts live rows only. */
export async function getStationSummary(): Promise<BatteryStationSummary> {
    const { data, error } = await supabaseAdmin
        .from("swap_stations")
        .select("status, battery_count, is_rider_visible")
        .is("deleted_at", null);

    if (error) throw error;

    const rows = data ?? [];
    const countBy = (status: RawStationRow["status"]) => rows.filter((r) => r.status === status).length;

    const maintenanceStations = countBy("maintenance");
    const notWorkingStations = countBy("not_working");

    return {
        totalStations: rows.length,
        workingStations: countBy("working"),
        maintenanceStations,
        notWorkingStations,
        attentionStations: maintenanceStations + notWorkingStations,
        hiddenStations: rows.filter((r) => !r.is_rider_visible).length,
        totalBatteries: rows.reduce((sum, r) => sum + (r.battery_count ?? 0), 0),
    };
}

// -------------------------------------------------------------------------
// Admin writes
// -------------------------------------------------------------------------

/**
 * A QIS id identifies one physical cabinet, so it may appear at exactly one
 * station. The unique constraint on `swap_station_qis_ids.qis_id` is what
 * actually enforces that; this exists so the admin gets a field-level message
 * naming the clashing station instead of an opaque 23505.
 */
async function assertQisIdsFree(qisIds: string[], excludeStationId?: string): Promise<void> {
    if (qisIds.length === 0) return;

    let query = supabaseAdmin
        .from("swap_station_qis_ids")
        .select("qis_id, swap_stations(id, name, deleted_at)")
        .in("qis_id", qisIds);

    if (excludeStationId) query = query.neq("swap_station_id", excludeStationId);

    const { data, error } = await query;
    if (error) throw error;

    // A soft-deleted station still holds its rows — the ids stay traceable —
    // but it must not block reuse, so those clashes are ignored here. The
    // unique constraint does not know about soft deletion, so releaseQisIds()
    // deletes the rows on soft delete to keep the two in agreement.
    const clashes = (data ?? []).flatMap((row) => {
        const station = (Array.isArray(row.swap_stations) ? row.swap_stations[0] : row.swap_stations) as
            | { id: string; name: string; deleted_at: string | null }
            | null;
        if (!station || station.deleted_at) return [];
        return [{ qisId: row.qis_id, name: station.name }];
    });

    if (clashes.length === 0) return;

    const taken = clashes.map((c) => c.qisId).join(", ");
    throw conflict(`${taken} is already registered to "${clashes[0].name}".`, {
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
        .from("swap_stations")
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
        .from("swap_stations")
        .select("serial_number")
        .order("serial_number", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    return (data?.serial_number ?? 0) + 1;
}

/** Replaces a station's QIS list wholesale. */
async function replaceQisIds(stationId: string, qisIds: string[]): Promise<void> {
    const { error: deleteError } = await supabaseAdmin
        .from("swap_station_qis_ids")
        .delete()
        .eq("swap_station_id", stationId);
    if (deleteError) throw deleteError;

    if (qisIds.length === 0) return;

    const { error } = await supabaseAdmin.from("swap_station_qis_ids").insert(
        qisIds.map((qis_id) => ({ swap_station_id: stationId, qis_id })),
    );
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw conflict("One of those QIS ids is already registered to another station.", {
                qisIds: "One of those QIS ids is already registered to another station.",
            });
        }
        throw error;
    }
}

export async function createStation(
    input: CreateBatteryStationInput,
    actor: AuthContext,
    req?: Request,
): Promise<BatteryStation> {
    await assertNameFree(input.name);
    await assertQisIdsFree(input.qisIds);

    const serialNumber = input.serialNumber ?? (await nextSerialNumber());

    const { data, error } = await supabaseAdmin
        .from("swap_stations")
        .insert({
            serial_number: serialNumber,
            // `code` is new and NOT NULL. Derived from the serial rather than
            // asked for: operators identify these by serial, and inventing a
            // second identifier for them to type would be a UI change.
            code: `SWP-${String(serialNumber).padStart(4, "0")}`,
            name: input.name,
            location: toEwkt(input.latitude, input.longitude),
            status: STATUS_TO_DB[input.status ?? "WORKING"],
            battery_count: input.batteryCount,
            is_rider_visible: input.isVisibleOnMobile ?? true,
            created_by_user_id: actor.id,
            updated_by_user_id: actor.id,
        })
        .select("id")
        .single();

    if (error) throw error;

    try {
        await replaceQisIds(data.id, input.qisIds);
    } catch (err) {
        // Compensating write: a station with none of its cabinets is worse
        // than no station, and there is no transaction spanning the two.
        await supabaseAdmin.from("swap_stations").delete().eq("id", data.id);
        throw err;
    }

    const station = await requireLiveStation(data.id);
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

    const update: Record<string, unknown> = { updated_by_user_id: actor.id };
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.status !== undefined) update.status = STATUS_TO_DB[patch.status];
    if (patch.batteryCount !== undefined) update.battery_count = patch.batteryCount;
    if (patch.isVisibleOnMobile !== undefined) update.is_rider_visible = patch.isVisibleOnMobile;
    if (patch.serialNumber !== undefined) update.serial_number = patch.serialNumber;

    // lat/lng are generated columns — moving a station means rewriting the
    // point. Either coordinate alone is meaningless, so the one not supplied
    // is taken from where the station already is.
    if (patch.latitude !== undefined || patch.longitude !== undefined) {
        update.location = toEwkt(
            patch.latitude ?? before.latitude,
            patch.longitude ?? before.longitude,
        );
    }

    const { data, error } = await supabaseAdmin
        .from("swap_stations")
        .update(update as never)
        .eq("id", id)
        .is("deleted_at", null)
        .select("id")
        .single();

    if (error) throw error;

    if (patch.qisIds !== undefined) await replaceQisIds(data.id, patch.qisIds);

    const station = await requireLiveStation(id);
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

    const { error } = await supabaseAdmin
        .from("swap_stations")
        .update({ is_rider_visible: isVisibleOnMobile, updated_by_user_id: actor.id })
        .eq("id", id)
        .is("deleted_at", null);

    if (error) throw error;

    const station = await requireLiveStation(id);
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
 * Soft delete: the row survives (audit trail, and the station stays
 * traceable), but it leaves every API response — mobile and admin alike.
 *
 * Its QIS rows are deleted rather than kept. They have to be: the unique
 * constraint on `qis_id` is global and knows nothing about soft deletion, so
 * leaving them would permanently block a cabinet from being re-registered at
 * whichever station physically holds it next. The audit entry below preserves
 * which ids this station had.
 */
export async function softDeleteStation(
    id: string,
    actor: AuthContext,
    req?: Request,
): Promise<void> {
    const before = await requireLiveStation(id);

    const { error } = await supabaseAdmin
        .from("swap_stations")
        .update({ deleted_at: new Date().toISOString(), updated_by_user_id: actor.id })
        .eq("id", id)
        .is("deleted_at", null);

    if (error) throw error;

    const { error: qisError } = await supabaseAdmin
        .from("swap_station_qis_ids")
        .delete()
        .eq("swap_station_id", id);
    if (qisError) throw qisError;

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
        .from("swap_stations")
        .select(STATION_COLUMNS)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("That battery station no longer exists.");
    return toBatteryStation(toRow(data as unknown as RawStationRow));
}
