import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    AdminRentalRow, CompleteRideInput, ListRentalsFilters, MoveToMaintenanceInput, RentalView,
} from "./rentals.types";

const RENTAL_COLUMNS = `
    id, status, started_at, ended_at,
    vehicles(id, name, registration_number, battery_percentage),
    bookings(
        plans(id, name, billing_cycle, price),
        stations(id, name, code)
    )
`;

const ADMIN_RENTAL_COLUMNS = `
    id, status, started_at, ended_at, start_battery_pct, end_battery_pct, fare, vehicle_id,
    users(id, full_name, phone),
    vehicles(id, name, registration_number, battery_percentage)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawRentalRow {
    id: string;
    status: RentalView["status"];
    started_at: string;
    ended_at: string | null;
    vehicles: unknown;
    bookings: unknown;
}

function toRentalView(row: RawRentalRow): RentalView {
    const booking = unwrap<{ plans: unknown; stations: unknown }>(row.bookings);
    const vehicle = unwrap<{ id: string; name: string; registration_number: string; battery_percentage: number }>(
        row.vehicles,
    );
    return {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        vehicle: vehicle ? { ...vehicle, battery_percentage: Number(vehicle.battery_percentage) } : null,
        plan: booking ? unwrap(booking.plans) : null,
        station: booking ? unwrap(booking.stations) : null,
    };
}

interface RawAdminRentalRow {
    id: string;
    status: RentalView["status"];
    started_at: string;
    ended_at: string | null;
    start_battery_pct: number | string | null;
    end_battery_pct: number | string | null;
    fare: number | string | null;
    vehicle_id: string;
    users: unknown;
    vehicles: unknown;
}

function toAdminRentalRow(row: RawAdminRentalRow): AdminRentalRow {
    const vehicle = unwrap<{ id: string; name: string; registration_number: string; battery_percentage: number }>(
        row.vehicles,
    );
    return {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        start_battery_pct: row.start_battery_pct === null ? null : Number(row.start_battery_pct),
        end_battery_pct: row.end_battery_pct === null ? null : Number(row.end_battery_pct),
        fare: row.fare === null ? null : Number(row.fare),
        rider: unwrap(row.users),
        vehicle: vehicle ? { ...vehicle, battery_percentage: Number(vehicle.battery_percentage) } : null,
    };
}

/** The rider's own currently-active rental — what post-booking-dashboard renders. */
export async function getMyCurrentRental(userId: string): Promise<RentalView> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(RENTAL_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No active rental found.");

    return toRentalView(data as unknown as RawRentalRow);
}

/** All of the rider's own rentals, most recent first — what the Booking History screen renders. */
export async function getMyRentalHistory(
    userId: string,
    filters: { page: number; pageSize: number },
): Promise<Paginated<RentalView>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("rentals")
        .select(RENTAL_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawRentalRow[]).map(toRentalView);
    return paginate(items, count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Admin — "Ride Management". Distance/current-location aren't tracked
// anywhere in the schema (no odometer/GPS columns) — same "not wired up yet,
// pending a 3rd-party telemetry integration" caveat as vehicle battery %.
// ---------------------------------------------------------------------------

export async function listRentals(filters: ListRentalsFilters): Promise<Paginated<AdminRentalRow>> {
    let query = supabaseAdmin.from("rentals").select(ADMIN_RENTAL_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);

    const [from, to] = toRange(filters);
    query = query.order("started_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return paginate(((data ?? []) as unknown as RawAdminRentalRow[]).map(toAdminRentalRow), count ?? 0, filters);
}

export async function getRentalById(id: string): Promise<AdminRentalRow> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(ADMIN_RENTAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Rental not found.");
    return toAdminRentalRow(data as unknown as RawAdminRentalRow);
}

async function requireActiveRental(id: string): Promise<RawAdminRentalRow> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(ADMIN_RENTAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Rental not found.");
    const row = data as unknown as RawAdminRentalRow;
    if (row.status !== "active") throw businessRule("This ride is not active.");
    return row;
}

/**
 * Normal ride end. trg_sync_vehicle_status_fn (20260727095801) also returns
 * the vehicle 'assigned' -> 'available', but only when the vehicle is still
 * exactly 'assigned' at that instant — if it drifted to some other status in
 * the meantime (e.g. a direct staff status override), that trigger silently
 * no-ops and strands the vehicle. Set it explicitly here too, the same way
 * moveRideToMaintenance already does, so completing a ride is never a no-op.
 */
export async function completeRide(
    id: string,
    input: CompleteRideInput,
    actor: AuthContext,
): Promise<AdminRentalRow> {
    const before = await requireActiveRental(id);

    const { data, error } = await supabaseAdmin
        .from("rentals")
        .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            end_battery_pct: input.end_battery_pct ?? null,
        })
        .eq("id", id)
        .select(ADMIN_RENTAL_COLUMNS)
        .single();
    if (error) throw error;

    const { error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "available" })
        .eq("id", before.vehicle_id);
    if (vehicleError) throw vehicleError;

    const rental = toAdminRentalRow(data as unknown as RawAdminRentalRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: unwrap<{ id: string }>(before.users)?.id ?? null,
        action: "rental.completed",
        entityType: "rental",
        entityId: id,
        before: { status: "active" },
        after: { status: "completed", end_battery_pct: rental.end_battery_pct },
    });

    return rental;
}

/**
 * Ends the ride like completeRide, but overrides the vehicle's post-trigger
 * 'available' state to 'maintenance' and opens a vehicle_maintenance ticket —
 * for a vehicle returned with a reported issue, not fit to hand to the next rider.
 */
export async function moveRideToMaintenance(
    id: string,
    input: MoveToMaintenanceInput,
    actor: AuthContext,
): Promise<AdminRentalRow> {
    const before = await requireActiveRental(id);

    const { error: rentalError } = await supabaseAdmin
        .from("rentals")
        .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            end_battery_pct: input.end_battery_pct ?? null,
        })
        .eq("id", id);
    if (rentalError) throw rentalError;

    const { error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "maintenance" })
        .eq("id", before.vehicle_id);
    if (vehicleError) throw vehicleError;

    const { error: ticketError } = await supabaseAdmin.from("vehicle_maintenance").insert({
        vehicle_id: before.vehicle_id,
        reported_by: actor.id,
        description: input.description,
        status: "reported",
    });
    if (ticketError) throw ticketError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: unwrap<{ id: string }>(before.users)?.id ?? null,
        action: "rental.moved_to_maintenance",
        entityType: "rental",
        entityId: id,
        before: { status: "active" },
        after: { status: "completed", vehicle_status: "maintenance", description: input.description },
    });

    return getRentalById(id);
}
