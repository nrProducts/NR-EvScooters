import { supabaseAdmin } from "../../config/supabase";
import { MaintenanceView } from "./maintenance.types";

const MAINTENANCE_COLUMNS = `
    id, status, description, resolved_at, created_at,
    vehicles(id, name, registration_number)
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
