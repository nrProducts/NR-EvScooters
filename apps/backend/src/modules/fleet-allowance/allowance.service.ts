import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound, serviceUnavailable } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { businessToday } from "../../common/dates";
import { AuthContext } from "../../types";
import { startEdgeFunction } from "../telematics/refresh.service";
import {
    AllowanceSettings, AllowanceTotals, BikeUsage, BikeUsageState, computeAllowance, daysBetween,
} from "./allowance.calc";

/**
 * Fleet kilometre allowance: the per-bike limit and the period it applies to
 * (both set by an admin), and how much of it the fleet has used.
 *
 * Read side: usage = odometer now (live readings) minus the bike's odometer at
 * the period's start (captured once per bike per period by the distance sync).
 * Write side: admin only, audited, and it nudges the distance sync so the new
 * period's starting odometers are captured right away.
 *
 * These tables are not in the generated types yet, hence the untyped client.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

export interface AllowanceVehicle {
    id: string;
    name: string | null;
    registration_number: string;
    status: string;
    model: string | null;
    state: BikeUsageState;
    used_km: number;
    limit_km: number;
    percent_of_limit: number;
    /** The bike's odometer right now, if it has one. */
    odometer_km: number | null;
}

export interface AllowanceSummary {
    settings: AllowanceSettings & { updated_at: string | null; updated_by: { id: string; full_name: string } | null };
    today: string;
    totals: AllowanceTotals;
    vehicles: AllowanceVehicle[];
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function readSettings(): Promise<{ id: string } & AllowanceSettings & { updated_at: string; updated_by: string | null }> {
    const { data, error } = await db
        .from("fleet_km_settings")
        .select("id, period_start, period_end, km_per_vehicle, updated_at, updated_by")
        .limit(1)
        .maybeSingle();
    if (error) throw serviceUnavailable("The fleet allowance is not set up yet (database update pending).");
    if (!data) throw notFound("No fleet allowance has been configured.");
    const row = data as { id: string; period_start: string; period_end: string; km_per_vehicle: number | string; updated_at: string; updated_by: string | null };
    return { ...row, km_per_vehicle: Number(row.km_per_vehicle) };
}

export async function getAllowanceSummary(): Promise<AllowanceSummary> {
    const today = businessToday();
    const settings = await readSettings();

    const [vehiclesRes, telemetryRes, baselineRes, closingRes, updaterRes] = await Promise.all([
        supabaseAdmin
            .from("vehicles")
            .select("id, display_name, registration_number, status, vehicle_models(name)")
            .neq("status", "retired"),
        db.from("vehicle_telemetry").select("*"),
        db.from("fleet_km_baseline").select("vehicle_id, start_odo").eq("period_start", settings.period_start),
        // Only a closed period needs the reading from its last day.
        today > settings.period_end
            ? db.from("vehicle_odometer_daily").select("vehicle_id, odometer_km").eq("day", settings.period_end)
            : Promise.resolve({ data: [], error: null }),
        settings.updated_by
            ? supabaseAdmin.from("users").select("id, full_name").eq("id", settings.updated_by).maybeSingle()
            : Promise.resolve({ data: null, error: null }),
    ]);
    if (vehiclesRes.error) throw vehiclesRes.error;
    // The starting-odometer and daily tables may not be migrated yet: usage is then
    // simply "awaiting start" for every bike rather than an error.
    if (baselineRes.error) console.warn("[fleet-allowance] fleet_km_baseline unreadable", baselineRes.error.message);
    if (closingRes.error) console.warn("[fleet-allowance] vehicle_odometer_daily unreadable", closingRes.error.message);

    const odometer = new Map<string, number>();
    for (const t of ((telemetryRes.error ? [] : telemetryRes.data) ?? []) as { vehicle_id: string; odometer_km: number | string | null }[]) {
        const o = num(t.odometer_km);
        if (o !== null) odometer.set(t.vehicle_id, o);
    }
    const baseline = new Map<string, number>(
        ((baselineRes.error ? [] : baselineRes.data) ?? []).map((b: { vehicle_id: string; start_odo: number | string }) => [b.vehicle_id, Number(b.start_odo)]),
    );
    const closing = new Map<string, number>(
        ((closingRes.error ? [] : closingRes.data) ?? []).map((b: { vehicle_id: string; odometer_km: number | string }) => [b.vehicle_id, Number(b.odometer_km)]),
    );

    const rows = (vehiclesRes.data ?? []) as unknown as {
        id: string; display_name: string | null; registration_number: string; status: string; vehicle_models: unknown;
    }[];

    const { totals, bikes } = computeAllowance(
        settings,
        today,
        rows.map((v) => ({
            id: v.id,
            baseline: baseline.get(v.id) ?? null,
            current: odometer.get(v.id) ?? null,
            atPeriodEnd: closing.get(v.id) ?? null,
        })),
    );
    const usage = new Map<string, BikeUsage>(bikes.map((b) => [b.id, b]));

    const vehicles: AllowanceVehicle[] = rows
        .map((v) => {
            const u = usage.get(v.id)!;
            const model = (Array.isArray(v.vehicle_models) ? v.vehicle_models[0] : v.vehicle_models) as { name: string } | null;
            return {
                id: v.id,
                name: v.display_name,
                registration_number: v.registration_number,
                status: v.status,
                model: model?.name ?? null,
                state: u.state,
                used_km: u.used_km,
                limit_km: u.limit_km,
                percent_of_limit: u.percent_of_limit,
                odometer_km: odometer.get(v.id) ?? null,
            };
        })
        .sort((a, b) => b.used_km - a.used_km || a.registration_number.localeCompare(b.registration_number));

    const updater = (updaterRes.data ?? null) as { id: string; full_name: string } | null;
    return {
        settings: {
            period_start: settings.period_start,
            period_end: settings.period_end,
            km_per_vehicle: settings.km_per_vehicle,
            updated_at: settings.updated_at,
            updated_by: updater,
        },
        today,
        totals,
        vehicles,
    };
}

export interface UpdateAllowanceInput {
    period_start: string;
    period_end: string;
    km_per_vehicle: number;
}

/** Admin only (enforced by the route). Validates, saves, audits, and nudges the sync. */
export async function updateAllowance(
    input: UpdateAllowanceInput,
    actor: AuthContext,
    req?: Request,
): Promise<AllowanceSummary> {
    if (daysBetween(input.period_start, input.period_end) < 0) {
        throw businessRule("The period must end on or after the day it starts.", { period_end: "Choose a date on or after the start." });
    }
    if (daysBetween(input.period_start, input.period_end) > 92) {
        throw businessRule("An allowance period can be at most 93 days.", { period_end: "Choose an end date within 93 days of the start." });
    }

    const before = await readSettings();
    const { error } = await db
        .from("fleet_km_settings")
        .update({
            period_start: input.period_start,
            period_end: input.period_end,
            km_per_vehicle: input.km_per_vehicle,
            updated_by: actor.id,
            updated_at: new Date().toISOString(),
        })
        .eq("id", before.id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "fleet_km_settings.updated",
        entityType: "fleet_km_settings",
        entityId: before.id,
        before: { period_start: before.period_start, period_end: before.period_end, km_per_vehicle: before.km_per_vehicle },
        after: { ...input },
        req,
    });

    // A new period needs each bike's starting odometer. The distance sync captures
    // any that are missing; start it now rather than waiting up to 2 hours.
    if (input.period_start !== before.period_start) startEdgeFunction("telematics-distance-sync");

    return getAllowanceSummary();
}
