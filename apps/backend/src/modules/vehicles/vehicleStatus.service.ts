import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { AuthContext } from "../../types";
import { adminEndPlanNow } from "../rentals/rentals.service";
import {
    assignTempVehicle, createMaintenanceTicket, triagePausePlan, updateMaintenanceTicket,
} from "../maintenance/maintenance.service";
import { getVehicleById } from "./vehicles.service";
import type { VehicleDetail } from "./vehicles.types";

/**
 * "Change status" on the Vehicles list: staff set a scooter to Available or
 * Maintenance directly. A vehicle's status is never written here — it is
 * derived (recompute_vehicle_status) from assignments, bookings and
 * maintenance tickets — so each choice is carried out through the actions
 * that produce that status:
 *
 *   Available   closes every open maintenance ticket (normal resolve rules:
 *               a temp-vehicle rider keeps their temp scooter, a paused plan
 *               resumes), then ends the plan of anyone still riding this
 *               scooter (adminEndPlanNow: deposit refund queued for review).
 *
 *   Maintenance opens a ticket. If a rider is on the scooter, staff choose
 *               what happens to them first: a temp scooter, a paused plan,
 *               or the plan ended.
 */
export type RiderAction = "temp_vehicle" | "pause" | "end_plan";

export type ChangeVehicleStatusInput =
    | { status: "available" }
    | { status: "maintenance"; description: string; rider_action?: RiderAction; temp_vehicle_id?: string };

/** The active rental currently holding this scooter, if any. */
async function activeRiderOn(vehicleId: string): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .select("rental_id, rentals!inner(status, user_id)")
        .eq("vehicle_id", vehicleId)
        .is("released_at", null)
        .maybeSingle();
    if (error) throw error;
    const rental = (Array.isArray(data?.rentals) ? data?.rentals[0] : data?.rentals) as
        | { status: string; user_id: string }
        | undefined;
    return rental?.status === "active" ? rental.user_id : null;
}

export async function changeVehicleStatus(
    vehicleId: string,
    input: ChangeVehicleStatusInput,
    actor: AuthContext,
): Promise<VehicleDetail> {
    const { data: vehicle, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, status")
        .eq("id", vehicleId)
        .maybeSingle();
    if (error) throw error;
    if (!vehicle) throw notFound("Vehicle not found.");
    if (vehicle.status === "retired") throw businessRule("This scooter has been scrapped.");
    if (vehicle.status === "reserved") {
        throw businessRule("This scooter is held for a booking. Cancel or reassign the booking first.");
    }

    if (input.status === "available") {
        const { data: tickets, error: ticketsError } = await supabaseAdmin
            .from("maintenance_tickets")
            .select("id")
            .eq("vehicle_id", vehicleId)
            .in("status", ["reported", "triaged", "in_progress"]);
        if (ticketsError) throw ticketsError;
        for (const ticket of tickets ?? []) {
            await updateMaintenanceTicket(ticket.id, { status: "resolved" }, actor);
        }

        await adminEndPlanNow(vehicleId, "Scooter set to available by staff", actor);
        return getVehicleById(vehicleId);
    }

    if (vehicle.status === "maintenance") throw businessRule("This scooter is already in maintenance.");

    const riderId = await activeRiderOn(vehicleId);
    if (riderId && !input.rider_action) {
        throw businessRule("Choose what happens to the rider on this scooter.");
    }

    // Check the temp scooter before anything changes, so a bad pick can't
    // leave a ticket open with the rider still unhandled.
    if (riderId && input.rider_action === "temp_vehicle") {
        if (!input.temp_vehicle_id) throw businessRule("Pick the scooter to give the rider.");
        if (input.temp_vehicle_id === vehicleId) throw businessRule("Pick a different scooter for the rider.");
        const { data: temp, error: tempError } = await supabaseAdmin
            .from("vehicles")
            .select("status")
            .eq("id", input.temp_vehicle_id)
            .maybeSingle();
        if (tempError) throw tempError;
        if (temp?.status !== "available") throw businessRule("That scooter isn't available to hand over.");
    }

    // Ending the plan first means the new ticket has no rider to displace.
    if (riderId && input.rider_action === "end_plan") {
        await adminEndPlanNow(vehicleId, `Scooter sent to maintenance by staff: ${input.description}`, actor);
    }

    const ticket = await createMaintenanceTicket(
        { vehicle_id: vehicleId, description: input.description, status: "reported" },
        actor,
    );

    if (riderId && input.rider_action === "temp_vehicle") {
        await assignTempVehicle(ticket.id, { temp_vehicle_id: input.temp_vehicle_id! }, actor);
    } else if (riderId && input.rider_action === "pause") {
        await triagePausePlan(ticket.id, actor);
    }

    return getVehicleById(vehicleId);
}
