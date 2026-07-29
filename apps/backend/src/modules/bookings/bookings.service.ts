import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { hasActiveRentalForUser } from "../users/users.service";
import { qualifyReferralIfApplicable } from "../referrals/referrals.service";
import { AuthContext, Paginated } from "../../types";
import {
    ACTIVE_BOOKING_STATUSES, AvailableVehicleView, BookingHistoryFilters, BookingRefundStatus,
    BookingStatus, BookingView, CancelBookingInput, ConfirmPickupInput, CreateBookingInput,
    PickupBookingView, PickupQueueFilters,
} from "./bookings.types";
import {
    FREE_CANCELLATION_GRACE_MINUTES, FREE_CANCELLATION_NOTICE_DAYS, LATE_CANCELLATION_PENALTY_RATE,
} from "./cancellation.constants";

const CANCELLATION_COLUMNS = `
    cancelled_at, cancellation_reason, plan_price_at_cancellation,
    cancellation_penalty_amount, refund_amount, refund_status
`;

const BOOKING_COLUMNS = `
    id, status, start_day, created_at, vehicle_id, referral_discount_amount,
    ${CANCELLATION_COLUMNS},
    vehicle_models(id, name),
    stations(id, name, code, lat, lng),
    plans(id, name, billing_cycle, price),
    vehicles(id, name, registration_number, battery_percentage, status)
`;

type RawBookingRow = {
    id: string;
    status: BookingStatus;
    start_day: string;
    created_at: string;
    vehicle_id: string | null;
    referral_discount_amount: number | null;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    plan_price_at_cancellation: number | null;
    cancellation_penalty_amount: number | null;
    refund_amount: number | null;
    refund_status: BookingRefundStatus | null;
    vehicle_models: unknown;
    stations: unknown;
    plans: unknown;
    vehicles: unknown;
};

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/**
 * Best-effort call to allocate_vehicle_for_booking() (20260727095801) — finds
 * a free unit matching the booking's model/station and reserves it
 * ('booked'). Never throws: a booking with no vehicle available yet is still
 * a valid booking, just unassigned until one frees up.
 */
async function tryAllocateVehicle(bookingId: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc("allocate_vehicle_for_booking", { p_booking_id: bookingId });
    if (error) {
        console.error("[bookings] allocate_vehicle_for_booking failed", { bookingId, error: error.message });
    }
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

export interface CancellationCharge {
    /** Whole calendar days from today to start_day; negative once start_day has passed. */
    daysUntilPickup: number;
    isLate: boolean;
    /** True when the booking is still inside its post-creation grace period. */
    withinGrace: boolean;
    /** plans.price minus any referral discount — what the rider would actually have owed. */
    chargeableAmount: number;
    penaltyAmount: number;
    refundAmount: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Cancelling is free when EITHER of these holds:
 *   1. The booking was created within FREE_CANCELLATION_GRACE_MINUTES, or
 *   2. start_day is FREE_CANCELLATION_NOTICE_DAYS or more calendar days out.
 * Otherwise LATE_CANCELLATION_PENALTY_RATE of the net plan price is kept back.
 *
 * start_day is DATE-only, so ">24h notice" is expressed in whole days:
 *   +2 days or more -> free  |  +1 (tomorrow), today, or past -> penalty
 *
 * The grace period matters because the notice rule alone only asks how close
 * pickup is: a booking made FOR tomorrow is born inside the penalty window and
 * would otherwise be charged seconds after it was created.
 *
 * The penalty applies to the NET price (after any referral discount) — charging
 * a fee on an amount the rider was never going to owe would be wrong.
 *
 * Exported so the service and the tests exercise the exact same rule, same
 * reason isValidStartDay is exported. `now` is injectable for deterministic
 * tests; like isValidStartDay this works in server-local time, never UTC.
 */
export function computeCancellationCharge(input: {
    startDay: string;
    planPrice: number | null;
    discountAmount?: number | null;
    /** bookings.created_at — omit only where it genuinely isn't known. */
    createdAt?: string | null;
    now?: Date;
}): CancellationCharge {
    const nowMs = (input.now ? new Date(input.now) : new Date()).getTime();

    const start = new Date(`${input.startDay}T00:00:00`);
    const today = input.now ? new Date(input.now) : new Date();
    today.setHours(0, 0, 0, 0);

    // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
    // which would otherwise slide the boundary by a whole day.
    const daysUntilPickup = Number.isNaN(start.getTime())
        ? 0
        : Math.round((start.getTime() - today.getTime()) / 86_400_000);

    const createdMs = input.createdAt ? new Date(input.createdAt).getTime() : NaN;
    const withinGrace = !Number.isNaN(createdMs)
        && nowMs - createdMs <= FREE_CANCELLATION_GRACE_MINUTES * 60_000
        // A clock skew that puts creation in the future must not silently
        // extend the grace window indefinitely.
        && nowMs >= createdMs;

    const isLate = !withinGrace && daysUntilPickup < FREE_CANCELLATION_NOTICE_DAYS;
    const chargeableAmount = round2(Math.max(0, (input.planPrice ?? 0) - (input.discountAmount ?? 0)));
    const penaltyAmount = isLate ? round2(chargeableAmount * LATE_CANCELLATION_PENALTY_RATE) : 0;
    const refundAmount = Math.max(0, round2(chargeableAmount - penaltyAmount));

    return { daysUntilPickup, isLate, withinGrace, chargeableAmount, penaltyAmount, refundAmount };
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
        vehicle: unwrap(row.vehicles),
        referral_discount_amount: row.referral_discount_amount ?? null,
        cancelled_at: row.cancelled_at ?? null,
        cancellation_reason: row.cancellation_reason ?? null,
        plan_price_at_cancellation: row.plan_price_at_cancellation ?? null,
        cancellation_penalty_amount: row.cancellation_penalty_amount ?? null,
        refund_amount: row.refund_amount ?? null,
        refund_status: row.refund_status ?? null,
    };
}

export async function createBooking(
    input: CreateBookingInput,
    actor: AuthContext,
): Promise<BookingView> {
    const [alreadyBooked, alreadyRenting] = await Promise.all([
        hasActiveBookingForUser(actor.id),
        hasActiveRentalForUser(actor.id),
    ]);
    if (alreadyBooked || alreadyRenting) {
        throw conflict("You already have an active booking or rental. Return your scooter or wait for pickup before booking another.");
    }

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .insert({
            user_id: actor.id,
            vehicle_model_id: input.vehicle_model_id,
            station_id: input.station_id,
            plan_id: input.plan_id,
            start_day: input.start_day,
            // Confirmed immediately — no payment gateway or admin approval
            // gates a booking anymore. Staff still hand over the physical
            // vehicle via confirmPickup() below, which is the real checkpoint.
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

    // Best-effort early reservation — flips a matching free vehicle to
    // 'booked' right away. If none is free yet, the booking is still valid;
    // staff can allocate one manually at pickup time (confirmPickup below).
    await tryAllocateVehicle(view.id);

    // First-booking referral discount, if this rider was referred and this
    // is genuinely their first booking (see qualifyReferralIfApplicable).
    const { discount_amount } = await qualifyReferralIfApplicable(actor.id, actor);
    if (discount_amount > 0) {
        await supabaseAdmin
            .from("bookings")
            .update({ referral_discount_amount: discount_amount })
            .eq("id", view.id);
    }

    return getBookingById(view.id);
}

export async function getBookingById(id: string): Promise<BookingView> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Booking not found.");
    return toBookingView(data as unknown as RawBookingRow);
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

/** All of the rider's own bookings, any status, most recent first — what the Booking History screen renders. */
export async function getMyBookingHistory(
    userId: string,
    filters: BookingHistoryFilters,
): Promise<Paginated<BookingView>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("bookings")
        .select(BOOKING_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawBookingRow[]).map(toBookingView);
    return paginate(items, count ?? 0, filters);
}

/**
 * Rider-initiated PRE-PICKUP cancellation. Distinct from rejectBooking (staff,
 * pending_payment only): this accepts 'confirmed' too and is scoped to the
 * caller's own booking. Post-pickup returns are a separate, future policy.
 *
 * No money has been captured (there is no checkout yet), so the refund fields
 * are recorded as a request for the future billing phase, not a reversal.
 */
export async function cancelMyBooking(
    bookingId: string,
    input: CancelBookingInput,
    actor: AuthContext,
): Promise<BookingView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, start_day, created_at, vehicle_id, referral_discount_amount, plans(price)")
        .eq("id", bookingId)
        .maybeSingle();

    if (fetchError) throw fetchError;
    // 404 rather than 403 for someone else's booking: a 403 would confirm that
    // the id exists, letting a caller probe for other riders' booking ids.
    if (!existing || existing.user_id !== actor.id) throw notFound("Booking not found.");

    if (existing.status === "fulfilled") {
        throw conflict("This booking has already been picked up and can't be cancelled here.");
    }
    if (existing.status === "cancelled") throw conflict("This booking is already cancelled.");
    if (existing.status === "expired") throw conflict("This booking has expired and can't be cancelled.");
    if (!(ACTIVE_BOOKING_STATUSES as string[]).includes(existing.status)) {
        throw conflict("This booking can no longer be cancelled.");
    }

    const charge = computeCancellationCharge({
        startDay: existing.start_day as string,
        planPrice: unwrap<{ price: number }>(existing.plans)?.price ?? null,
        discountAmount: existing.referral_discount_amount as number | null,
        createdAt: existing.created_at as string,
    });

    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({
            status: "cancelled",
            cancelled_at: new Date().toISOString(),
            cancelled_by: actor.id,
            cancellation_reason: input.reason ?? null,
            plan_price_at_cancellation: charge.chargeableAmount,
            cancellation_penalty_amount: charge.penaltyAmount,
            refund_amount: charge.refundAmount,
            refund_status: charge.refundAmount > 0 ? "pending" : "not_required",
            // vehicle_id is deliberately untouched — trg_release_vehicle_on_booking_close
            // (20260727095801) frees the held unit and nulls it as part of this update.
        })
        .eq("id", bookingId)
        .eq("user_id", actor.id)
        // Optimistic-concurrency guard: if staff confirmed pickup between the
        // read above and here, this matches zero rows instead of cancelling a
        // booking that is already fulfilled.
        .in("status", ACTIVE_BOOKING_STATUSES as string[])
        .select("id")
        .maybeSingle();

    if (error) throw error;
    if (!updated) throw conflict("This booking can no longer be cancelled.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: actor.id,
        action: "booking.cancelled",
        entityType: "booking",
        entityId: bookingId,
        before: {
            status: existing.status,
            vehicle_id: existing.vehicle_id,
            start_day: existing.start_day,
        },
        after: {
            status: "cancelled",
            days_until_pickup: charge.daysUntilPickup,
            chargeable_amount: charge.chargeableAmount,
            penalty_amount: charge.penaltyAmount,
            refund_amount: charge.refundAmount,
            reason: input.reason ?? null,
        },
    });

    await notifyUser(actor.id, {
        template: "booking_cancelled",
        title: "Booking Cancelled",
        body: charge.penaltyAmount > 0
            ? `Your booking is cancelled. A late-cancellation fee of ₹${charge.penaltyAmount} applies, and a refund request for ₹${charge.refundAmount} has been recorded.`
            : `Your booking is cancelled with no cancellation fee. A refund request for ₹${charge.refundAmount} has been recorded.`,
        screen: "booking-history",
    });

    return getBookingById(bookingId);
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

// Keep in sync with BOOKING_COLUMNS: RawPickupBookingRow extends RawBookingRow,
// so TypeScript will NOT flag a missing column here — the fields would just
// silently come back undefined in staff responses.
const PICKUP_BOOKING_COLUMNS = `
    id, status, start_day, created_at, vehicle_id, referral_discount_amount,
    ${CANCELLATION_COLUMNS},
    vehicle_models(id, name),
    stations(id, name, code),
    plans(id, name, billing_cycle, price),
    vehicles(id, name, registration_number, battery_percentage, status),
    users!bookings_user_id_fkey(id, full_name, phone)
`;

type RawPickupBookingRow = RawBookingRow & { users: unknown };

function toPickupBookingView(row: RawPickupBookingRow): PickupBookingView {
    return {
        ...toBookingView(row),
        rider: unwrap(row.users) as PickupBookingView["rider"],
    };
}

/**
 * Bookings for the admin "Bookings" screen. Defaults to 'confirmed' (the
 * original pickup-queue behavior) when no status filter is given; pass one
 * to see any other stage (pending_payment/cancelled/expired/fulfilled).
 */
export async function listPickupQueue(filters: PickupQueueFilters): Promise<Paginated<PickupBookingView>> {
    const [from, to] = toRange(filters);
    let query = supabaseAdmin
        .from("bookings")
        .select(PICKUP_BOOKING_COLUMNS, { count: "exact" })
        .eq("status", filters.status ?? "confirmed");

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
 * Staff hands over a physical vehicle for a confirmed (approved) booking:
 * creates the rentals row (the actual ride), frees the booking into its
 * terminal 'fulfilled' state, and flips the vehicle 'booked' -> 'assigned'.
 * Normally the vehicle was already reserved by allocate_vehicle_for_booking()
 * at booking/approval time (booking.vehicle_id); input.vehicle_id is only
 * needed as a manual override (e.g. that reservation never found a unit).
 * Sequential writes with error propagation, same convention
 * kyc.service.ts's approveKyc/rejectKyc already use for multi-step writes —
 * no transaction infra exists here.
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
    const vehicleId = input.vehicle_id ?? bookingRow.vehicle_id;
    if (!vehicleId) {
        throw businessRule("No vehicle has been allocated to this booking yet — pick one manually.");
    }

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, status, station_id, model_id")
        .eq("id", vehicleId)
        .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");
    // 'booked' is the normal path (already reserved by allocate_vehicle_for_booking);
    // 'available' covers a manual override onto a unit that was never auto-allocated.
    if (vehicle.status !== "booked" && vehicle.status !== "available") {
        throw businessRule("This vehicle is not available for pickup.");
    }
    if (vehicle.station_id !== stationId) throw businessRule("This vehicle is not at the booking's pickup station.");
    if (vehicle.model_id !== modelId) throw businessRule("This vehicle does not match the booked model.");

    const rider = unwrap<{ id: string; full_name: string; phone: string | null }>(bookingRow.users);

    const { error: rentalError } = await supabaseAdmin.from("rentals").insert({
        user_id: rider!.id,
        vehicle_id: vehicleId,
        booking_id: bookingId,
        status: "active",
        started_at: new Date().toISOString(),
    });
    if (rentalError) throw rentalError;

    const { error: vehicleUpdateError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "assigned" })
        .eq("id", vehicleId);
    if (vehicleUpdateError) throw vehicleUpdateError;

    const { data: updated, error: bookingUpdateError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "fulfilled", vehicle_id: vehicleId })
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
        after: { vehicle_id: vehicleId, status: "fulfilled" },
    });

    await notifyUser(rider!.id, {
        template: "pickup_confirmed",
        title: "Scooter Picked Up",
        body: "Enjoy your ride! Your rental is now active.",
        screen: "post-booking-dashboard",
    });

    return toPickupBookingView(updated as unknown as RawPickupBookingRow);
}
