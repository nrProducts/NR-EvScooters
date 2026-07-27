import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { AppError, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { Paginated, AuthContext } from "../../types";
import {
    CreateVehicleInput, ListVehiclesFilters, UpdateVehicleInput, VehicleDetail,
    VehicleDocumentRow, VehicleMaintenanceRow, VehicleRentalRow, VehicleRow,
} from "./vehicles.types";

const VEHICLE_COLUMNS = `
    id, name, registration_number, battery_number, manufacturer, model, vin,
    battery_percentage, status, last_service_date, next_service_due_date,
    active, created_at, updated_at
`;

/** Postgres `numeric` columns round-trip through PostgREST as strings, not numbers. */
function toVehicleRow(row: VehicleRow): VehicleRow {
    return { ...row, battery_percentage: Number(row.battery_percentage) };
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listVehicles(filters: ListVehiclesFilters): Promise<Paginated<VehicleRow>> {
    let query = supabaseAdmin.from("vehicles").select(VEHICLE_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) {
        const term = escapeLike(filters.search);
        query = query.or(
            [
                `name.ilike.%${term}%`,
                `registration_number.ilike.%${term}%`,
                `vin.ilike.%${term}%`,
                `model.ilike.%${term}%`,
            ].join(","),
        );
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return paginate(((data ?? []) as unknown as VehicleRow[]).map(toVehicleRow), count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getVehicleById(id: string): Promise<VehicleDetail> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Vehicle not found.");

    const [documents, maintenanceHistory, rentalHistory] = await Promise.all([
        documentsForVehicle(id),
        maintenanceForVehicle(id),
        rentalsForVehicle(id),
    ]);

    const currentRental = rentalHistory.find((r) => r.status === "active") ?? null;

    return {
        ...toVehicleRow(data as unknown as VehicleRow),
        documents,
        maintenance_history: maintenanceHistory,
        rental_history: rentalHistory,
        current_rider: currentRental?.rider ?? null,
    };
}

async function documentsForVehicle(vehicleId: string): Promise<VehicleDocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_documents")
        .select("id, doc_type, doc_number, issued_date, expiry_date")
        .eq("vehicle_id", vehicleId)
        .order("expiry_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as VehicleDocumentRow[];
}

async function maintenanceForVehicle(vehicleId: string): Promise<VehicleMaintenanceRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select("id, status, description, resolved_at, created_at")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as VehicleMaintenanceRow[];
}

async function rentalsForVehicle(vehicleId: string): Promise<VehicleRentalRow[]> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("id, status, started_at, ended_at, users(id, full_name)")
        .eq("vehicle_id", vehicleId)
        .order("started_at", { ascending: false })
        .limit(20);
    if (error) throw error;

    return ((data ?? []) as unknown as Array<{
        id: string; status: string; started_at: string; ended_at: string | null; users: unknown;
    }>).map((row) => ({
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        rider: unwrap<{ id: string; full_name: string }>(row.users),
    }));
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createVehicle(
    input: CreateVehicleInput,
    actor: AuthContext,
    req?: Request,
): Promise<VehicleRow> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .insert({
            name: input.name,
            registration_number: input.registration_number,
            battery_number: input.battery_number,
            manufacturer: input.manufacturer,
            model: input.model,
            vin: input.vin,
            battery_percentage: input.battery_percentage ?? 100,
            status: input.status ?? "available",
            last_service_date: input.last_service_date ?? null,
            next_service_due_date: input.next_service_due_date ?? null,
        })
        .select(VEHICLE_COLUMNS)
        .single();

    if (error) throw mapPostgresError(error);

    const vehicle = toVehicleRow(data as unknown as VehicleRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        after: { registration_number: vehicle.registration_number, vin: vehicle.vin, status: vehicle.status },
        req,
    });

    return vehicle;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateVehicle(
    id: string,
    patch: UpdateVehicleInput,
    actor: AuthContext,
    req?: Request,
): Promise<VehicleRow> {
    const before = await requireVehicle(id);

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update(patch)
        .eq("id", id)
        .select(VEHICLE_COLUMNS)
        .maybeSingle();

    if (error) throw mapPostgresError(error);
    if (!data) throw notFound("Vehicle not found.");

    const vehicle = toVehicleRow(data as unknown as VehicleRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.updated",
        entityType: "vehicle",
        entityId: vehicle.id,
        before: pick(before, Object.keys(patch)),
        after: patch,
        req,
    });

    return vehicle;
}

async function requireVehicle(id: string): Promise<VehicleRow> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Vehicle not found.");
    return data as unknown as VehicleRow;
}

function pick<T extends object>(source: T, keys: string[]): Record<string, unknown> {
    const record = source as unknown as Record<string, unknown>;
    return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]));
}

/** PostgREST treats % and _ as wildcards inside ilike patterns. */
function escapeLike(input: string): string {
    return input.replace(/[%_\\,()]/g, "");
}

/** 23505 = unique_violation on registration_number / battery_number / vin. */
function mapPostgresError(error: { code?: string; message?: string }): Error {
    if (error.code === "23505") {
        if (error.message?.includes("registration_number")) {
            return conflict("This registration number is already in use.", {
                registration_number: "This registration number is already in use.",
            });
        }
        if (error.message?.includes("battery_number")) {
            return conflict("This battery number is already in use.", {
                battery_number: "This battery number is already in use.",
            });
        }
        if (error.message?.includes("vin")) {
            return conflict("This VIN is already in use.", { vin: "This VIN is already in use." });
        }
        return conflict("That value is already in use.");
    }
    return error as Error;
}

// ---------------------------------------------------------------------------
// Assign (pre-existing) — kept as-is; not part of this pass's fleet CRUD.
// Note this is an explam api structure
// ---------------------------------------------------------------------------

export async function assignVehicle(vehicleId: string, userId: string) {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "in_use" })
        .eq("id", vehicleId)
        .eq("status", "available")
        .select()
        .single();

    if (error || !data) throw new AppError(400, "Vehicle unavailable or not found");
    return data;
}
