import { supabaseAdmin } from "../../config/supabase";
import { KYC_STATUSES, KycStatus } from "../../types";
import { VEHICLE_STATUSES, VehicleStatus } from "../vehicles/vehicles.types";
import { MAINTENANCE_STATUSES, MaintenanceStatus } from "../maintenance/maintenance.types";
import { ReportsSummary } from "./reports.types";

function zeroed<T extends string>(keys: readonly T[]): Record<T, number> {
    return Object.fromEntries(keys.map((k) => [k, 0])) as Record<T, number>;
}

async function vehicleStatusCounts(): Promise<Record<VehicleStatus, number>> {
    const { data, error } = await supabaseAdmin.from("vehicles").select("status");
    if (error) throw error;
    const counts = zeroed(VEHICLE_STATUSES);
    for (const row of (data ?? []) as Array<{ status: VehicleStatus }>) counts[row.status] += 1;
    return counts;
}

async function maintenanceStatusCounts(): Promise<Record<MaintenanceStatus, number>> {
    const { data, error } = await supabaseAdmin.from("vehicle_maintenance").select("status");
    if (error) throw error;
    const counts = zeroed(MAINTENANCE_STATUSES);
    for (const row of (data ?? []) as Array<{ status: MaintenanceStatus }>) counts[row.status] += 1;
    return counts;
}

async function riderStats(): Promise<{ total: number; by_kyc_status: Record<KycStatus, number> }> {
    const { data: riderRole, error: roleError } = await supabaseAdmin
        .from("roles")
        .select("id")
        .eq("name", "rider")
        .single();
    if (roleError) throw roleError;

    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("users!inner(kyc_status, deleted_at)")
        .eq("role_id", riderRole.id);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{ users: { kyc_status: KycStatus; deleted_at: string | null } }>;
    const live = rows.filter((r) => !r.users.deleted_at);

    const by_kyc_status = zeroed(KYC_STATUSES);
    for (const r of live) by_kyc_status[r.users.kyc_status] += 1;

    return { total: live.length, by_kyc_status };
}

async function revenueSummary(): Promise<ReportsSummary["revenue"]> {
    const { data, error } = await supabaseAdmin.from("invoices").select("amount_due, payment_status");
    if (error) throw error;

    const rows = (data ?? []) as Array<{ amount_due: number | string; payment_status: string }>;
    let paid_total = 0;
    let pending_total = 0;
    let refunded_total = 0;
    for (const row of rows) {
        const amount = Number(row.amount_due);
        if (row.payment_status === "succeeded") paid_total += amount;
        else if (row.payment_status === "pending") pending_total += amount;
        else if (row.payment_status === "refunded") refunded_total += amount;
    }

    return { paid_total, pending_total, refunded_total, invoice_count: rows.length };
}

/**
 * Single aggregate endpoint backing the Reports page. Fetches unpaginated
 * status/amount columns and counts them in memory — fine at this app's
 * current scale (same approach already used by assertNotLastAdmin and
 * userIdsWithRole); worth revisiting with real SQL aggregates once the
 * fleet/rider counts grow large.
 *
 * Deliberately absent: per-repair maintenance cost (vehicle_maintenance has
 * no cost column in the schema) and time-bucketed revenue trends (would need
 * a dedicated grouped query) — both left for a future pass.
 */
export async function getReportsSummary(): Promise<ReportsSummary> {
    const [vehicleStatus, riders, revenue, maintenanceStatus] = await Promise.all([
        vehicleStatusCounts(),
        riderStats(),
        revenueSummary(),
        maintenanceStatusCounts(),
    ]);

    return {
        vehicles: {
            total: Object.values(vehicleStatus).reduce((a, b) => a + b, 0),
            by_status: vehicleStatus,
        },
        riders,
        revenue,
        maintenance: { by_status: maintenanceStatus },
    };
}
