import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { AuthContext, Paginated } from "../../types";
import {
    ACTIVE_BOOKING_STATUSES, AvailableVehicleView, BookingStatus, BookingView, ConfirmPickupInput,
    CreateBookingInput, PickupBookingView, PickupQueueFilters,
} from "./bookings.types";

const BOOKING_COLUMNS = `
    id, status, start_day, created_at,
    vehicle_models(id, name),
    stations(id, name, code),
    plans(id, name, billing_cycle, price)
`;

type RawBookingRow = {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_models: unknown;
    stations: unknown;
    plans: unknown;
};

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/**
 * Not a Sunday (dow 0) and not in the past. Exported so validation.ts and
 * tests exercise the exact same rule the DB's CHECK constraints enforce —
 * this is the app-level copy that turns a bad request into a clean 400
 * instead of a raw constraint-violation error.
 */
export function isValidStartDay(dateStr: string): boolean {
    const parsed = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (parsed < today) return false;

    return parsed.getDay() !== 0;
}

export function toBookingView(row: RawBookingRow): BookingView {
    return {
        id: row.id,
        status: row.status,
        start_day: row.start_day,
        created_at: row.created_at,
        vehicle_model: unwrap(row.vehicle_models),
        station: unwrap(row.stations),
        plan: unwrap(row.plans),
    };
}

export async function createBooking(
    input: CreateBookingInput,
    actor: AuthContext,
): Promise<BookingView> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .insert({
            user_id: actor.id,
            vehicle_model_id: input.vehicle_model_id,
            station_id: input.station_id,
            plan_id: input.plan_id,
            start_day: input.start_day,
            // No payment step exists yet, so a booking is immediately ready
            // for pickup rather than sitting at the pending_payment default.
            // When real payment ships, this becomes the payment-success
            // handler's job instead.
            status: "confirmed",
        })
        .select(BOOKING_COLUMNS)
        .single();

    if (error) {
        if (error.code === "23514" || error.code === "P0001") {
            throw businessRule("This booking could not be created — check the pickup day and try again.");
        }
        throw error;
    }

    const view = toBookingView(data as unknown as RawBookingRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: actor.id,
        action: "booking.created",
        entityType: "booking",
        entityId: view.id,
        after: { vehicle_model_id: input.vehicle_model_id, station_id: input.station_id, plan_id: input.plan_id, start_day: input.start_day },
    });

    return view;
}

export async function getMyCurrentBooking(userId: string): Promise<BookingView> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("user_id", userId)
        .in("status", ACTIVE_BOOKING_STATUSES as string[])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No active booking found.");

    return toBookingView(data as unknown as RawBookingRow);
}

/** Mirrors hasActiveRentalForUser in users.service.ts. pending_payment counts as active. */
export async function hasActiveBookingForUser(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", ACTIVE_BOOKING_STATUSES as string[]);

    if (error) throw error;
    return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Staff pickup queue + confirmation — the "future pickup/check-in phase"
// this module's own header comment anticipated but deferred.
// ---------------------------------------------------------------------------

const PICKUP_BOOKING_COLUMNS = `
    id, status, start_day, created_at,
    vehicle_models(id, name),
    stations(id, name, code),
    plans(id, name, billing_cycle, price),
    users(id, full_name, phone)
`;

type RawPickupBookingRow = RawBookingRow & { users: unknown };

function toPickupBookingView(row: RawPickupBookingRow): PickupBookingView {
    return {
        ...toBookingView(row),
        rider: unwrap(row.users) as PickupBookingView["rider"],
    };
}

/** Confirmed bookings awaiting pickup, soonest start_day first. */
export async function listPickupQueue(filters: PickupQueueFilters): Promise<Paginated<PickupBookingView>> {
    const [from, to] = toRange(filters);
    let query = supabaseAdmin
        .from("bookings")
        .select(PICKUP_BOOKING_COLUMNS, { count: "exact" })
        .eq("status", "confirmed");

    if (filters.stationId) query = query.eq("station_id", filters.stationId);

    const { data, error, count } = await query
        .order("start_day", { ascending: true })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawPickupBookingRow[]).map(toPickupBookingView);
    return paginate(items, count ?? 0, filters);
}

/** Available vehicles matching this booking's model + pickup station — what the staff picker offers. */
export async function listAvailableVehiclesForBooking(bookingId: string): Promise<AvailableVehicleView[]> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("vehicle_model_id, station_id")
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) throw notFound("Booking not found.");

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, name, registration_number, battery_percentage")
        .eq("model_id", booking.vehicle_model_id)
        .eq("station_id", booking.station_id)
        .eq("status", "available");

    if (error) throw error;
    return (data ?? []) as AvailableVehicleView[];
}

/**
 * Staff assigns a specific physical vehicle to a confirmed booking: creates
 * the rentals row (the actual ride), frees the booking into its terminal
 * 'fulfilled' state, and flips the vehicle to in_use. Sequential writes with
 * error propagation, same convention kyc.service.ts's approveKyc/rejectKyc
 * already use for multi-step writes — no transaction infra exists here.
 */
export async function confirmPickup(
    bookingId: string,
    input: ConfirmPickupInput,
    actor: AuthContext,
): Promise<PickupBookingView> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select(PICKUP_BOOKING_COLUMNS)
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) throw notFound("Booking not found.");

    const bookingRow = booking as unknown as RawPickupBookingRow & {
        vehicle_models: { id: string } | { id: string }[] | null;
        stations: { id: string } | { id: string }[] | null;
    };
    if (bookingRow.status !== "confirmed") {
        throw conflict("This booking is not awaiting pickup.");
    }

    const modelId = unwrap<{ id: string }>(bookingRow.vehicle_models)?.id;
    const stationId = unwrap<{ id: string }>(bookingRow.stations)?.id;

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, status, station_id, model_id")
        .eq("id", input.vehicle_id)
        .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");
    if (vehicle.status !== "available") throw businessRule("This vehicle is not available for pickup.");
    if (vehicle.station_id !== stationId) throw businessRule("This vehicle is not at the booking's pickup station.");
    if (vehicle.model_id !== modelId) throw businessRule("This vehicle does not match the booked model.");

    const rider = unwrap<{ id: string; full_name: string; phone: string | null }>(bookingRow.users);

    const { error: rentalError } = await supabaseAdmin.from("rentals").insert({
        user_id: rider!.id,
        vehicle_id: input.vehicle_id,
        booking_id: bookingId,
        status: "active",
        started_at: new Date().toISOString(),
    });
    if (rentalError) throw rentalError;

    const { error: vehicleUpdateError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "in_use" })
        .eq("id", input.vehicle_id);
    if (vehicleUpdateError) throw vehicleUpdateError;

    const { data: updated, error: bookingUpdateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "fulfilled" })
        .eq("id", bookingId)
        .select(PICKUP_BOOKING_COLUMNS)
        .single();
    if (bookingUpdateError) throw bookingUpdateError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider!.id,
        action: "booking.fulfilled",
        entityType: "booking",
        entityId: bookingId,
        after: { vehicle_id: input.vehicle_id, status: "fulfilled" },
    });

    await notifyUser(rider!.id, {
        template: "pickup_confirmed",
        title: "Scooter Picked Up",
        body: "Enjoy your ride! Your rental is now active.",
        screen: "post-booking-dashboard",
    });

    return toPickupBookingView(updated as unknown as RawPickupBookingRow);
}
