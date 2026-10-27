import type { Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound, serviceUnavailable } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { ControlMode, intellicarConfigured, resolveVehicleNo, sendControlCommand } from "./intellicar.client";
import { getVehicleTelemetry } from "./telematics.service";

/**
 * Remote immobilise / mobilise of a scooter.
 *
 * This is the one place the backend ACTS on a vehicle, so every guard lives
 * here rather than being left to the caller:
 *
 *   • admin only (enforced by the route, restated by the actor check);
 *   • a written reason, kept with the command;
 *   • the admin must type the scooter's registration number — a mis-click on
 *     the wrong row cannot stop the wrong scooter;
 *   • never while the scooter is moving unless the admin explicitly
 *     acknowledges the risk, because cutting power at speed can cause a crash;
 *   • every attempt, successful or not, is recorded in `vehicle_control_commands`
 *     AND the audit log;
 *   • nothing calls this automatically — no payment status, no alert.
 *
 * `sent` means the platform accepted the command, NOT that the scooter has
 * obeyed it; the next telemetry sync (≤ 5 min) shows the real state.
 */
const db = supabaseAdmin as unknown as SupabaseClient;

/** At or above this a live scooter counts as moving. */
export const MOVING_KMPH = 5;

export interface ControlInput {
    vehicleId: string;
    action: "immobilise" | "mobilise";
    mode: ControlMode;
    reason: string;
    confirmRegistration: string;
    acknowledgeMoving: boolean;
}

const norm = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();

export async function controlVehicle(
    input: ControlInput,
    actor: AuthContext,
    req?: Request,
): Promise<{ command_id: string; provider_cmd_id: string | null; status: "sent" }> {
    if (actor.role !== "admin") throw businessRule("Only an administrator can immobilise or mobilise a vehicle.");
    if (!intellicarConfigured()) throw serviceUnavailable("Vehicle tracking is not connected, so the command cannot be sent.");

    const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, registration_number, vin, status")
        .eq("id", input.vehicleId)
        .maybeSingle();
    if (error) throw error;
    if (!vehicle) throw notFound("Vehicle not found.");

    if (norm(input.confirmRegistration) !== norm(vehicle.registration_number)) {
        throw businessRule("The registration number you typed does not match this vehicle.", {
            confirmRegistration: "Type the vehicle's registration number exactly.",
        });
    }

    const telemetry = await getVehicleTelemetry(vehicle.id);
    const speed = telemetry?.freshness === "live" ? telemetry.speed_kmph : null;
    const moving = speed !== null && speed >= MOVING_KMPH;
    if (input.action === "immobilise" && moving && !input.acknowledgeMoving) {
        throw conflict(
            `This scooter is moving at ${Math.round(speed)} km/h. Cutting power while it is moving can cause a crash — ` +
            "confirm that you understand the risk, or wait until it has stopped.",
        );
    }

    const base = {
        vehicle_id: vehicle.id,
        registration_number: vehicle.registration_number,
        action: input.action,
        mode: input.mode,
        reason: input.reason.trim(),
        requested_by: actor.id,
        speed_kmph_at_request: speed,
    };

    let providerCmdId: string | null = null;
    let failure: string | null = null;
    try {
        const vehicleNo = await resolveVehicleNo(vehicle.vin, vehicle.registration_number);
        if (!vehicleNo) throw new Error("This vehicle is not on the tracking account, so it cannot be controlled remotely.");
        providerCmdId = (await sendControlCommand(input.action, vehicleNo, input.mode)).cmdId;
    } catch (err) {
        failure = err instanceof Error ? err.message : "The command could not be sent.";
    }

    const { data: row, error: insertError } = await db
        .from("vehicle_control_commands")
        .insert({ ...base, status: failure ? "failed" : "sent", provider_cmd_id: providerCmdId, error: failure })
        .select("id")
        .single();
    if (insertError) throw insertError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: input.action === "immobilise" ? "vehicle.immobilised" : "vehicle.mobilised",
        entityType: "vehicle",
        entityId: vehicle.id,
        after: {
            registration_number: vehicle.registration_number,
            mode: input.mode,
            reason: base.reason,
            outcome: failure ? "failed" : "sent",
            error: failure,
            provider_cmd_id: providerCmdId,
            speed_kmph_at_request: speed,
            acknowledged_moving: moving ? input.acknowledgeMoving : false,
        },
        req,
    });

    if (failure) throw serviceUnavailable(failure);
    return { command_id: (row as { id: string }).id, provider_cmd_id: providerCmdId, status: "sent" };
}

export interface ControlCommandRow {
    id: string;
    action: "immobilise" | "mobilise";
    mode: string;
    reason: string;
    status: "sent" | "failed";
    error: string | null;
    provider_cmd_id: string | null;
    speed_kmph_at_request: number | null;
    created_at: string;
    requested_by: { id: string; full_name: string } | null;
}

/** The most recent commands sent to a scooter, newest first. */
export async function listControlCommands(vehicleId: string, limit = 10): Promise<ControlCommandRow[]> {
    const { data, error } = await db
        .from("vehicle_control_commands")
        .select("id, action, mode, reason, status, error, provider_cmd_id, speed_kmph_at_request, created_at, requested_by")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    const rows = (data ?? []) as (Omit<ControlCommandRow, "requested_by"> & { requested_by: string | null })[];

    const ids = [...new Set(rows.map((r) => r.requested_by).filter((x): x is string => !!x))];
    const { data: users, error: usersError } = ids.length
        ? await supabaseAdmin.from("users").select("id, full_name").in("id", ids)
        : { data: [], error: null };
    if (usersError) throw usersError;
    const names = new Map((users ?? []).map((u) => [u.id, u.full_name as string]));

    return rows.map((r) => ({
        ...r,
        speed_kmph_at_request: r.speed_kmph_at_request === null ? null : Number(r.speed_kmph_at_request),
        requested_by: r.requested_by ? { id: r.requested_by, full_name: names.get(r.requested_by) ?? "Admin" } : null,
    }));
}
