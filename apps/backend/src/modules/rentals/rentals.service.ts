import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import { RentalView } from "./rentals.types";

const RENTAL_COLUMNS = `
    id, status, started_at, ended_at,
    vehicles(id, name, registration_number, battery_percentage),
    bookings(
        plans(id, name, billing_cycle, price),
        stations(id, name, code)
    )
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
    return {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        vehicle: unwrap(row.vehicles),
        plan: booking ? unwrap(booking.plans) : null,
        station: booking ? unwrap(booking.stations) : null,
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
