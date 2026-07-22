import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext } from "../../types";
import { ACTIVE_BOOKING_STATUSES, BookingStatus, BookingView, CreateBookingInput } from "./bookings.types";

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
