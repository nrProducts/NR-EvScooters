import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { AuthContext, Paginated } from "../../types";
import {
    AdminRentalRow, CompleteRideInput, ListRentalsFilters, MoveToMaintenanceInput, RentalView,
    RequestReturnInput,
} from "./rentals.types";
import { LATE_RETURN_FEE_PER_DAY, MAX_LATE_PENALTY_DAYS } from "./returnPolicy.constants";

/**
 * Post-pickup return request + late-fee settlement. Shared by both column
 * lists below so the two can't drift.
 */
const RETURN_COLUMNS = `
    return_requested_at, return_reason, return_feedback, return_due_at,
    days_late, late_penalty_amount, late_fee_per_day
`;

/**
 * ⚠️ Every field on RentalView must appear in this string. TypeScript CANNOT
 * check it — the select is an untyped template string and the result is
 * double-cast (`data as unknown as RawRentalRow`), so a field added to the
 * interface but omitted here compiles clean and silently returns undefined.
 */
const RENTAL_COLUMNS = `
    id, status, started_at, ended_at,
    ${RETURN_COLUMNS},
    vehicles(id, name, registration_number, battery_percentage),
    bookings(
        plans(id, name, billing_cycle, price),
        stations(id, name, code)
    )
`;

/**
 * Same warning as RENTAL_COLUMNS — and with higher stakes: requireActiveRental
 * reads through this, so omitting return_due_at here would make every
 * late-return penalty silently compute as zero.
 */
const ADMIN_RENTAL_COLUMNS = `
    id, status, started_at, ended_at, start_battery_pct, end_battery_pct, fare, vehicle_id,
    ${RETURN_COLUMNS},
    users(id, full_name, phone),
    vehicles(id, name, registration_number, battery_percentage)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/** End of the calendar day `at` falls on, in server-local time. */
export function returnDeadlineFor(at: Date): Date {
    const due = new Date(at);
    due.setHours(23, 59, 59, 999);
    return due;
}

export interface LateReturnCharge {
    /** Whole calendar days the handover day is past the due day; 0 when on time. */
    daysLate: number;
    isLate: boolean;
    feePerDay: number;
    penaltyAmount: number;
    /** false when staff close a ride the rider never requested to return. */
    hadRequest: boolean;
}

/**
 * Flat fee per whole calendar day past the deadline. Compares CALENDAR DAYS,
 * not elapsed hours: handing over at 23:59 on the due day is 0 days late,
 * 00:30 the next morning is 1. That is deliberate under a per-day fee ("you
 * kept it into another day") and is what the rider-facing warning states.
 *
 * A null/unparseable due date means there was no return request at all —
 * staff closing a ride the rider never asked to end, or a force-end. Those
 * must NOT be retro-penalised, so this fails open with a zero charge.
 *
 * Exported so the service and the tests exercise the same rule, same reason
 * computeCancellationCharge is exported from bookings.service.ts. `now` is
 * injectable for deterministic tests.
 */
export function computeLateReturnPenalty(input: {
    returnDueAt: string | null;
    now?: Date;
}): LateReturnCharge {
    const feePerDay = LATE_RETURN_FEE_PER_DAY;

    if (!input.returnDueAt) {
        return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadRequest: false };
    }

    const due = new Date(input.returnDueAt);
    if (Number.isNaN(due.getTime())) {
        return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadRequest: false };
    }

    const dueDay = new Date(due);
    dueDay.setHours(0, 0, 0, 0);
    const returnDay = input.now ? new Date(input.now) : new Date();
    returnDay.setHours(0, 0, 0, 0);

    // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
    // which would otherwise slide the boundary by a whole day.
    const rawDaysLate = Math.round((returnDay.getTime() - dueDay.getTime()) / 86_400_000);
    const daysLate = Math.min(Math.max(0, rawDaysLate), MAX_LATE_PENALTY_DAYS);

    return {
        daysLate,
        isLate: daysLate > 0,
        feePerDay,
        penaltyAmount: Math.round(daysLate * feePerDay * 100) / 100,
        hadRequest: true,
    };
}

/** The return-request/settlement columns, shared by both raw row shapes. */
interface RawReturnFields {
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    days_late: number | null;
    late_penalty_amount: number | string | null;
    late_fee_per_day: number | string | null;
}

/** Postgres returns `numeric` as a string, hence the coercion (cf. `fare`). */
function toReturnView(row: RawReturnFields) {
    return {
        return_requested_at: row.return_requested_at ?? null,
        return_reason: row.return_reason ?? null,
        return_feedback: row.return_feedback ?? null,
        return_due_at: row.return_due_at ?? null,
        days_late: row.days_late ?? null,
        late_penalty_amount: row.late_penalty_amount == null ? null : Number(row.late_penalty_amount),
        late_fee_per_day: row.late_fee_per_day == null ? null : Number(row.late_fee_per_day),
    };
}

interface RawRentalRow extends RawReturnFields {
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
        ...toReturnView(row),
    };
}

interface RawAdminRentalRow extends RawReturnFields {
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
        ...toReturnView(row),
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

/**
 * Rider asks to hand the scooter back. This deliberately does NOT end the
 * rental — status stays 'active' and only the return_* columns are written.
 *
 * Two reasons, both load-bearing:
 *   1. trg_sync_vehicle_status (20260727095801) fires on ANY departure from
 *      'active' and flips the held vehicle 'assigned' -> 'available'. Ending
 *      the rental here would put a scooter the rider still physically holds
 *      back into the bookable pool.
 *   2. Lateness can only be measured at the moment of physical handover, so
 *      the ride must stay open until staff confirm it via completeRide.
 */
export async function requestReturn(
    rentalId: string,
    input: RequestReturnInput,
    actor: AuthContext,
): Promise<RentalView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("rentals")
        .select("id, user_id, status, return_requested_at")
        .eq("id", rentalId)
        .maybeSingle();

    if (fetchError) throw fetchError;
    // 404 rather than 403 for someone else's rental: a 403 would confirm the
    // id exists, letting a caller probe for other riders' rental ids.
    if (!existing || existing.user_id !== actor.id) throw notFound("Rental not found.");

    if (existing.status !== "active") throw conflict("This rental is no longer active.");
    if (existing.return_requested_at) {
        throw conflict("You've already requested a return for this scooter.");
    }

    const now = new Date();
    const dueAt = returnDeadlineFor(now);

    const { data: updated, error } = await supabaseAdmin
        .from("rentals")
        .update({
            return_requested_at: now.toISOString(),
            return_reason: input.reason,
            return_feedback: input.feedback ?? null,
            return_due_at: dueAt.toISOString(),
            // `status` is deliberately absent so trg_sync_vehicle_status does
            // NOT fire and the vehicle stays 'assigned'. Do not add it here.
        })
        .eq("id", rentalId)
        .eq("user_id", actor.id)
        // Optimistic-concurrency guard: if staff closed the ride, or a
        // double-tap raced us, this matches zero rows instead of overwriting.
        .eq("status", "active")
        .is("return_requested_at", null)
        .select("id")
        .maybeSingle();

    if (error) throw error;
    if (!updated) throw conflict("This rental can no longer be returned here.");

    // Best-effort: a feedback write must never roll back an accepted return
    // request. upsert handles the UNIQUE(rental_id) constraint on re-submit.
    const { error: feedbackError } = await supabaseAdmin
        .from("rental_feedback")
        .upsert(
            { rental_id: rentalId, user_id: actor.id, rating: input.rating, comment: input.feedback ?? null },
            { onConflict: "rental_id" },
        );
    if (feedbackError) {
        console.error("[rentals] failed to record rental_feedback", {
            rentalId, error: feedbackError.message,
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: actor.id,
        action: "rental.return_requested",
        entityType: "rental",
        entityId: rentalId,
        before: { status: "active", return_requested_at: null },
        after: {
            return_reason: input.reason,
            return_due_at: dueAt.toISOString(),
            rating: input.rating,
        },
    });

    await notifyUser(actor.id, {
        template: "rental_return_requested",
        title: "Return Requested",
        body: `Hand your scooter in by ${dueAt.toLocaleDateString()} 11:59 PM. Our team will confirm the handover. A late fee of ₹${LATE_RETURN_FEE_PER_DAY} per day applies after that.`,
        screen: "post-booking-dashboard",
    });

    return getMyCurrentRental(actor.id);
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

/**
 * Late-fee settlement written when staff take physical delivery. Shared by
 * completeRide and moveRideToMaintenance so the two can't drift — otherwise
 * "return it damaged" would be a free late-fee bypass, and those rows would
 * keep days_late null forever.
 */
function settlementPayload(before: RawAdminRentalRow) {
    const charge = computeLateReturnPenalty({ returnDueAt: before.return_due_at });
    return {
        payload: {
            days_late: charge.daysLate,
            late_penalty_amount: charge.penaltyAmount,
            late_fee_per_day: charge.feePerDay,
        },
        charge,
    };
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
    const { payload: settlement, charge } = settlementPayload(before);

    const { data, error } = await supabaseAdmin
        .from("rentals")
        .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            end_battery_pct: input.end_battery_pct ?? null,
            ...settlement,
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
    const riderId = unwrap<{ id: string }>(before.users)?.id ?? null;

    await writeAudit({
        actorId: actor.id,
        targetUserId: riderId,
        action: "rental.completed",
        entityType: "rental",
        entityId: id,
        before: { status: "active" },
        after: {
            status: "completed",
            end_battery_pct: rental.end_battery_pct,
            days_late: charge.daysLate,
            late_penalty_amount: charge.penaltyAmount,
            had_return_request: charge.hadRequest,
        },
    });

    if (riderId) {
        await notifyUser(riderId, {
            template: "rental_completed",
            title: "Ride Completed",
            body: charge.penaltyAmount > 0
                ? `Thanks for returning your scooter. It came back ${charge.daysLate} day(s) late, so a ₹${charge.penaltyAmount} late fee was recorded.`
                : "Thanks for returning your scooter. No late fee was applied.",
            screen: "booking-history",
        });
    }

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
    // Settled here too: staff still take physical delivery of a damaged
    // scooter, so skipping this would make "return it broken" a free
    // late-fee bypass and leave days_late null on these rows forever.
    const { payload: settlement, charge } = settlementPayload(before);

    const { error: rentalError } = await supabaseAdmin
        .from("rentals")
        .update({
            status: "completed",
            ended_at: new Date().toISOString(),
            end_battery_pct: input.end_battery_pct ?? null,
            ...settlement,
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
        after: {
            status: "completed",
            vehicle_status: "maintenance",
            description: input.description,
            days_late: charge.daysLate,
            late_penalty_amount: charge.penaltyAmount,
            had_return_request: charge.hadRequest,
        },
    });

    return getRentalById(id);
}
