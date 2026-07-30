import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    AdminMaintenanceRow, CreateMaintenanceInput, ListMaintenanceFilters, MaintenanceView,
    UpdateMaintenanceInput,
} from "./maintenance.types";

const MAINTENANCE_COLUMNS = `
    id, status, description, resolved_at, created_at,
    vehicles(id, name, registration_number)
`;

const ADMIN_MAINTENANCE_COLUMNS = `
    id, status, description, resolved_at, created_at,
    vehicles(id, name, registration_number),
    users(id, full_name)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawMaintenanceRow {
    id: string;
    status: MaintenanceView["status"];
    description: string;
    resolved_at: string | null;
    created_at: string;
    vehicles: unknown;
}

interface RawAdminMaintenanceRow extends RawMaintenanceRow {
    users: unknown;
}

function toMaintenanceView(row: RawMaintenanceRow): MaintenanceView {
    return {
        id: row.id,
        status: row.status,
        description: row.description,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        vehicle: unwrap(row.vehicles),
    };
}

function toAdminMaintenanceRow(row: RawAdminMaintenanceRow): AdminMaintenanceRow {
    return { ...toMaintenanceView(row), reported_by: unwrap(row.users) };
}

/**
 * Maintenance events for vehicles this rider has personally rented — there's
 * no direct rider<->maintenance link in the schema (vehicle_maintenance is
 * reported by staff, not the rider), so this goes through the rider's own
 * rental history to find which vehicles are theirs to see history for.
 */
export async function getMyMaintenanceHistory(userId: string): Promise<MaintenanceView[]> {
    const { data: rentals, error: rentalsError } = await supabaseAdmin
        .from("rentals")
        .select("vehicle_id")
        .eq("user_id", userId);

    if (rentalsError) throw rentalsError;
    const vehicleIds = [...new Set((rentals ?? []).map((r) => r.vehicle_id as string))];
    if (vehicleIds.length === 0) return [];

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select(MAINTENANCE_COLUMNS)
        .in("vehicle_id", vehicleIds)
        .order("created_at", { ascending: false });

    if (error) throw error;
    return ((data ?? []) as unknown as RawMaintenanceRow[]).map(toMaintenanceView);
}

// ---------------------------------------------------------------------------
// Admin/staff — across the whole fleet
// ---------------------------------------------------------------------------

export async function listMaintenance(filters: ListMaintenanceFilters): Promise<Paginated<AdminMaintenanceRow>> {
    let query = supabaseAdmin.from("vehicle_maintenance").select(ADMIN_MAINTENANCE_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return paginate(
        ((data ?? []) as unknown as RawAdminMaintenanceRow[]).map(toAdminMaintenanceRow),
        count ?? 0,
        filters,
    );
}

export async function createMaintenanceTicket(
    input: CreateMaintenanceInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id")
        .eq("id", input.vehicle_id)
        .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .insert({
            vehicle_id: input.vehicle_id,
            reported_by: actor.id,
            description: input.description,
            status: input.status ?? "reported",
        })
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();

    if (error) throw error;
    const ticket = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.created",
        entityType: "vehicle_maintenance",
        entityId: ticket.id,
        after: { vehicle_id: input.vehicle_id, status: ticket.status },
    });

    return ticket;
}

export async function updateMaintenanceTicket(
    id: string,
    patch: UpdateMaintenanceInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const next: Record<string, unknown> = { ...patch };
    // resolved_at is server-derived from the status transition, never client-supplied.
    if (patch.status) next.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update(next)
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");
    const ticket = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    if (patch.status === "resolved" && ticket.vehicle) {
        await releaseVehicleIfNoOpenTickets(ticket.vehicle.id);
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.updated",
        entityType: "vehicle_maintenance",
        entityId: ticket.id,
        before: null,
        after: next,
    });

    return ticket;
}

/**
 * Resolving one ticket shouldn't free a vehicle that still has another open
 * issue — only flip it back to 'available' once nothing else is outstanding.
 * The status guard on the vehicles update also protects against clobbering a
 * vehicle that's moved on (e.g. re-assigned) since entering maintenance.
 */
async function releaseVehicleIfNoOpenTickets(vehicleId: string): Promise<void> {
    const { count, error: openError } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId)
        .in("status", ["reported", "in_progress"]);
    if (openError) throw openError;
    if ((count ?? 0) > 0) return;

    const { error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "available" })
        .eq("id", vehicleId)
        .eq("status", "maintenance");
    if (vehicleError) throw vehicleError;
}
