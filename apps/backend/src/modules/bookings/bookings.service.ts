import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { addDays } from "../../common/dates";
import { notifyUser } from "../notifications/notifications.service";
import { hasActiveRentalForUser } from "../users/users.service";
import { computeLateReturnPenalty, planExpiryFor } from "../rentals/rentals.service";
import { qualifyReferralIfApplicable } from "../referrals/referrals.service";
import { getDepositForBookingOrNull } from "../deposits/deposits.service";
import { initiateCancellationRefund } from "../refunds/refunds.service";
import { AuthContext, Paginated } from "../../types";
import {
    ACTIVE_BOOKING_STATUSES, AvailableVehicleView, BookingActiveRental, BookingHistoryFilters,
    BookingRefundStatus, BookingStatus, BookingView, CancelBookingInput, ConfirmPickupInput, CreateBookingInput,
    PickupBookingView, PickupQueueFilters,
} from "./bookings.types";
import {
    FREE_CANCELLATION_GRACE_MINUTES, FREE_CANCELLATION_NOTICE_DAYS, LATE_CANCELLATION_PENALTY_RATE,
} from "./cancellation.constants";

const CANCELLATION_COLUMNS = `
    cancelled_at, cancellation_reason, plan_price_at_cancellation,
    cancellation_penalty_amount, refund_amount, refund_status,
    refund_initiated_at, refund_completed_at, refund_transaction_id
`;

/** Recurring-billing state — see 20260810100300_booking_plan_billing.sql. */
const PLAN_BILLING_COLUMNS = `
    plan_status, plan_activated_at, plan_duration_days, deposit_amount_at_booking,
    current_period_start, next_due_at, plan_paused_at, plan_paused_days_total
`;

/**
 * The rental this booking's handover opened (bookings.active_rental_id) —
 * just enough of rentals' return-request/settlement state (rentals.types.ts's
 * RentalReturnFields) for the Rental Operations screen to know whether a
 * return is pending, without a second round trip. `!inner` swapped in by
 * pickupBookingColumns() below turns this from a left join into a filter.
 */
const ACTIVE_RENTAL_COLUMNS = `
    id, status, started_at, return_requested_at, return_reason, return_feedback, return_due_at, return_approved_at
`;

const BOOKING_COLUMNS = `
    id, status, start_day, created_at, vehicle_id, referral_discount_amount,
    ${CANCELLATION_COLUMNS},
    ${PLAN_BILLING_COLUMNS},
    vehicle_models(id, name),
    stations(id, name, code, lat, lng),
    plans(id, name, billing_cycle, price, duration_days, deposit_amount),
    vehicles(id, name, registration_number, battery_percentage, status),
    active_rental:rentals!bookings_active_rental_id_fkey(${ACTIVE_RENTAL_COLUMNS})
`;

type RawActiveRental = {
    id: string;
    status: string;
    started_at: string;
    return_requested_at: string | null;
    return_reason: string | null;
    return_feedback: string | null;
    return_due_at: string | null;
    return_approved_at: string | null;
};

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
    refund_initiated_at: string | null;
    refund_completed_at: string | null;
    refund_transaction_id: string | null;
    plan_status: BookingView["plan_status"];
    plan_activated_at: string | null;
    plan_duration_days: number | null;
    deposit_amount_at_booking: number | string | null;
    current_period_start: string | null;
    next_due_at: string | null;
    plan_paused_at: string | null;
    plan_paused_days_total: number;
    vehicle_models: unknown;
    stations: unknown;
    plans: unknown;
    vehicles: unknown;
    active_rental: unknown;
};

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function toActiveRental(raw: unknown): BookingActiveRental | null {
    const row = unwrap<RawActiveRental>(raw);
    if (!row) return null;
    return {
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        return_requested_at: row.return_requested_at ?? null,
        return_reason: row.return_reason ?? null,
        return_feedback: row.return_feedback ?? null,
        return_due_at: row.return_due_at ?? null,
        return_approved_at: row.return_approved_at ?? null,
    };
}

/**
 * Live estimate of the late-return fee that WOULD be settled if this
 * booking's pending return were approved right now — same helper
 * completeRide's settlement uses (rentals.service.ts), just not written
 * anywhere. return_due_at is guaranteed non-null whenever return_requested_at
 * is (rentals_return_request_chk), so no expires_at fallback is needed here.
 */
function toReturnLateFeePreview(activeRental: BookingActiveRental | null): BookingView["return_late_fee_preview"] {
    if (!activeRental?.return_requested_at) return null;
    const charge = computeLateReturnPenalty({ returnDueAt: activeRental.return_due_at });
    return { days_late: charge.daysLate, penalty_amount: charge.penaltyAmount, fee_per_day: charge.feePerDay };
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
    /** Penalty on the rental portion only — the deposit is never the rider's "fault" money. */
    penaltyAmount: number;
    /** The security deposit actually paid (deposits.amount) — always refunded in full pre-pickup, never penalized. */
    depositRefund: number;
    /** (chargeableAmount - penaltyAmount) + depositRefund. */
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
 * a fee on an amount the rider was never going to owe would be wrong. The
 * security deposit (if any was actually paid — pass depositAmount only for a
 * booking that reached 'confirmed') is never subject to this penalty: no
 * damage is possible before pickup, so it's always refunded in full.
 *
 * Exported so the service and the tests exercise the exact same rule, same
 * reason isValidStartDay is exported. `now` is injectable for deterministic
 * tests; like isValidStartDay this works in server-local time, never UTC.
 */
export function computeCancellationCharge(input: {
    startDay: string;
    planPrice: number | null;
    discountAmount?: number | null;
    /** deposits.amount for this booking — omit (or 0) if the booking was never paid. */
    depositAmount?: number | null;
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
    const depositRefund = round2(Math.max(0, input.depositAmount ?? 0));
    const refundAmount = round2(Math.max(0, chargeableAmount - penaltyAmount) + depositRefund);

    return { daysUntilPickup, isLate, withinGrace, chargeableAmount, penaltyAmount, depositRefund, refundAmount };
}

export function toBookingView(row: RawBookingRow): BookingView {
    const activeRental = toActiveRental(row.active_rental);
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
        refund_initiated_at: row.refund_initiated_at ?? null,
        refund_completed_at: row.refund_completed_at ?? null,
        refund_transaction_id: row.refund_transaction_id ?? null,
        plan_status: row.plan_status ?? null,
        plan_activated_at: row.plan_activated_at ?? null,
        plan_duration_days: row.plan_duration_days ?? null,
        deposit_amount_at_booking: row.deposit_amount_at_booking == null ? null : Number(row.deposit_amount_at_booking),
        current_period_start: row.current_period_start ?? null,
        next_due_at: row.next_due_at ?? null,
        plan_paused_at: row.plan_paused_at ?? null,
        plan_paused_days_total: row.plan_paused_days_total ?? 0,
        active_rental: activeRental,
        return_late_fee_preview: toReturnLateFeePreview(activeRental),
    };
}

/**
 * A booking is only worth taking if a unit can actually be handed over at that
 * station. tryAllocateVehicle() below is still best-effort — between this count
 * and the insert another rider could take the last one — but that narrow race
 * is very different from cheerfully confirming a booking against an empty
 * station, which is what happened before this check existed.
 */
async function assertVehicleAvailable(modelId: string, stationId: string): Promise<void> {
    const { count, error } = await supabaseAdmin
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("model_id", modelId)
        .eq("station_id", stationId)
        .eq("status", "available")
        .eq("active", true);

    if (error) throw error;
    if ((count ?? 0) === 0) {
        throw businessRule("No scooters of this model are available at that pickup station right now. Try another day or station.");
    }
}

/** The plan must belong to the booked model and still be on sale. */
async function assertPlanBookable(planId: string, modelId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .select("id, active, vehicle_model_id")
        .eq("id", planId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("That plan could not be found.");
    if (!data.active) throw businessRule("That plan is no longer available. Please choose another.");
    if (data.vehicle_model_id !== modelId) {
        throw businessRule("That plan does not apply to the scooter you selected.");
    }
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

    await Promise.all([
        assertPlanBookable(input.plan_id, input.vehicle_model_id),
        assertVehicleAvailable(input.vehicle_model_id, input.station_id),
    ]);

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .insert({
            user_id: actor.id,
            vehicle_model_id: input.vehicle_model_id,
            station_id: input.station_id,
            plan_id: input.plan_id,
            start_day: input.start_day,
            // Payment-gated: the rider must pay (weekly rent + deposit) via
            // POST /payments/bookings/:id/order before this moves to
            // 'confirmed' — see payments.service.ts's applyPaymentSuccess.
            // Staff then hand over the physical vehicle via confirmPickup()
            // below, which activates the plan.
            status: "pending_payment",
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

/**
 * Rider-scoped "get one of my own bookings by id" — unlike getMyCurrentBooking
 * (GET /bookings/me/current), which only ever returns a pending_payment/confirmed
 * booking, this also serves a 'fulfilled' one. The Billing screen needs that:
 * plan_status/next_due_at live on bookings, not rentals, so once a rider has
 * been picked up (the normal case for most of a rental's life), this is the
 * only way for the app to keep showing their recurring-billing state.
 */
export async function getMyBookingById(bookingId: string, userId: string): Promise<BookingView> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select(BOOKING_COLUMNS)
        .eq("id", bookingId)
        .eq("user_id", userId)
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
 * Opens the refund request for a pre-pickup cancellation, right after the
 * booking row has been flipped to 'cancelled' with refund_status='pending'.
 * Deliberately does NOT call the gateway here — a cancellation refund needs
 * staff to review and approve it first (POST /refunds/:id/retry, which
 * doubles as "approve" for a refund that's never been processed and "retry"
 * for one that failed). Never throws: a DB hiccup creating the refund row
 * must not fail the rider's (or staff's) cancel request — worst case the
 * refund request doesn't appear yet and needs a manual follow-up.
 */
async function openCancellationRefund(
    bookingId: string,
    depositId: string,
    amount: number,
    actor: AuthContext | null,
): Promise<void> {
    try {
        await initiateCancellationRefund(bookingId, depositId, amount, actor);
    } catch (err) {
        console.error("[bookings] opening cancellation refund failed", {
            bookingId,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

/**
 * Rider-initiated PRE-PICKUP cancellation. Distinct from rejectBooking (staff,
 * pending_payment only): this accepts 'confirmed' too and is scoped to the
 * caller's own booking. Post-pickup returns are a separate, future policy.
 *
 * Cancelling within FREE_CANCELLATION_GRACE_MINUTES of booking is always fee-
 * free (see computeCancellationCharge). If the booking had actually been paid
 * for (status 'confirmed'), the eligible amount — rental minus any late fee,
 * plus the full security deposit — is queued as a refund request
 * (refund_status='pending'). The actual Razorpay refund only fires once staff
 * approve it (POST /refunds/:id/retry) — cancellation refunds are never
 * auto-processed, unlike deposit refunds. A booking still awaiting payment
 * has nothing to refund: no fee, no refund request.
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

    // Only a 'confirmed' booking was ever actually paid for — a
    // 'pending_payment' one has nothing to charge a fee against or refund,
    // no matter what the timing math would otherwise say.
    const wasPaid = existing.status === "confirmed";
    const deposit = wasPaid ? await getDepositForBookingOrNull(bookingId) : null;

    const charge = computeCancellationCharge({
        startDay: existing.start_day as string,
        planPrice: unwrap<{ price: number }>(existing.plans)?.price ?? null,
        discountAmount: existing.referral_discount_amount as number | null,
        depositAmount: deposit?.amount ?? 0,
        createdAt: existing.created_at as string,
    });

    const penaltyAmount = wasPaid ? charge.penaltyAmount : 0;
    const refundAmount = wasPaid ? charge.refundAmount : 0;
    // 'pending' here means "refund requested, awaiting staff approval" — the
    // gateway call only fires once an admin approves via POST /refunds/:id/retry.
    const refundStatus: BookingRefundStatus = refundAmount > 0 ? "pending" : "not_required";
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({
            status: "cancelled",
            cancelled_at: nowIso,
            cancelled_by: actor.id,
            cancellation_reason: input.reason ?? null,
            plan_price_at_cancellation: charge.chargeableAmount,
            cancellation_penalty_amount: penaltyAmount,
            refund_amount: refundAmount,
            refund_status: refundStatus,
            refund_initiated_at: refundStatus === "pending" ? nowIso : null,
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
            penalty_amount: penaltyAmount,
            deposit_refund: charge.depositRefund,
            refund_amount: refundAmount,
            reason: input.reason ?? null,
        },
    });

    if (refundStatus === "pending" && deposit) {
        await openCancellationRefund(bookingId, deposit.id, refundAmount, actor);
    }

    await notifyUser(actor.id, {
        template: "booking_cancelled",
        title: "Booking Cancelled",
        body: penaltyAmount > 0
            ? `Your booking is cancelled. A late-cancellation fee of ₹${penaltyAmount} applies. Your refund of ₹${refundAmount} has been requested and will be sent to your original payment method after review.`
            : refundAmount > 0
                ? `Your booking is cancelled with no cancellation fee. Your refund of ₹${refundAmount} has been requested and will be sent to your original payment method after review.`
                : "Your booking is cancelled with no cancellation fee.",
        screen: "booking-history",
    });

    return getBookingById(bookingId);
}

/**
 * Staff-initiated cancellation — the fix for a vehicle getting force-released
 * (e.g. the Vehicles admin screen's "Mark available") out from under a
 * booking that still held it as 'pending_payment'/'confirmed': that only
 * ever touched vehicles.status directly, leaving the booking itself active,
 * so the rider's app kept showing it as a current booking with a cancel
 * option. This closes the booking out properly instead. No late-cancellation
 * penalty applies — the rider isn't the one backing out — and whatever was
 * already captured for the initial rental+deposit payment is queued as a
 * refund request, same as cancelMyBooking, pending staff approval.
 */
export async function adminCancelBooking(
    bookingId: string,
    reason: string,
    actor: AuthContext,
): Promise<BookingView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, vehicle_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Booking not found.");
    if (!(ACTIVE_BOOKING_STATUSES as string[]).includes(existing.status)) {
        throw conflict("Only a pending or confirmed booking can be cancelled.");
    }

    const wasPaid = existing.status === "confirmed";
    const deposit = wasPaid ? await getDepositForBookingOrNull(bookingId) : null;

    const { data: paidInvoices, error: invoiceError } = await supabaseAdmin
        .from("invoices")
        .select("amount_due")
        .eq("booking_id", bookingId)
        .eq("payment_status", "succeeded")
        .in("payment_type", ["rental", "deposit"]);
    if (invoiceError) throw invoiceError;
    const refundAmount = (paidInvoices ?? []).reduce((sum, inv) => sum + Number(inv.amount_due), 0);
    // 'pending' here means "refund requested, awaiting staff approval" — the
    // gateway call only fires once an admin approves via POST /refunds/:id/retry.
    const refundStatus: BookingRefundStatus = refundAmount > 0 ? "pending" : "not_required";
    const nowIso = new Date().toISOString();

    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({
            status: "cancelled",
            cancelled_at: nowIso,
            cancelled_by: actor.id,
            cancellation_reason: reason,
            cancellation_penalty_amount: 0,
            refund_amount: refundAmount,
            refund_status: refundStatus,
            refund_initiated_at: refundStatus === "pending" ? nowIso : null,
            // vehicle_id is deliberately untouched — trg_release_vehicle_on_booking_close
            // (20260727095801) frees the held unit and nulls it as part of this update.
            // If the vehicle was already force-marked available out-of-band, the trigger's
            // own `where status = 'booked'` guard just no-ops on that part — harmless.
        })
        .eq("id", bookingId)
        .in("status", ACTIVE_BOOKING_STATUSES as string[])
        .select("id")
        .maybeSingle();
    if (error) throw error;
    if (!updated) throw conflict("This booking can no longer be cancelled.");

    await writeAudit({
        actorId: actor.id,
        targetUserId: existing.user_id,
        action: "booking.cancelled",
        entityType: "booking",
        entityId: bookingId,
        before: { status: existing.status, vehicle_id: existing.vehicle_id },
        after: { status: "cancelled", reason, refund_amount: refundAmount },
    });

    if (refundStatus === "pending" && deposit) {
        await openCancellationRefund(bookingId, deposit.id, refundAmount, actor);
    }

    await notifyUser(existing.user_id, {
        template: "booking_cancelled",
        title: "Booking Cancelled",
        body: refundAmount > 0
            ? `Your booking was cancelled by our team: ${reason}. Your refund of ₹${refundAmount} has been requested and will be sent to your original payment method after review.`
            : `Your booking was cancelled by our team: ${reason}.`,
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
//
// active_rental normally embeds as a left join (a pre-pickup booking has
// none yet); the Return Requests tab needs it as a genuine FILTER instead,
// which PostgREST only applies to embedded-resource conditions when the
// embed itself is `!inner` — hence this is a function, not a constant.
function pickupBookingColumns(opts: { innerActiveRental?: boolean } = {}): string {
    const activeRentalRel = opts.innerActiveRental
        ? "rentals!bookings_active_rental_id_fkey!inner"
        : "rentals!bookings_active_rental_id_fkey";
    return `
        id, status, start_day, created_at, vehicle_id, referral_discount_amount,
        ${CANCELLATION_COLUMNS},
        ${PLAN_BILLING_COLUMNS},
        vehicle_models(id, name),
        stations(id, name, code),
        plans(id, name, billing_cycle, price, duration_days, deposit_amount),
        vehicles(id, name, registration_number, battery_percentage, status),
        users!bookings_user_id_fkey(id, full_name, phone),
        active_rental:${activeRentalRel}(${ACTIVE_RENTAL_COLUMNS})
    `;
}

const PICKUP_BOOKING_COLUMNS = pickupBookingColumns();

type RawPickupBookingRow = RawBookingRow & { users: unknown };

function toPickupBookingView(row: RawPickupBookingRow): PickupBookingView {
    return {
        ...toBookingView(row),
        rider: unwrap(row.users) as PickupBookingView["rider"],
    };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a free-text search into a booking-id allowlist. PostgREST can't
 * OR-combine conditions across several embedded tables (rider name, vehicle
 * registration) in one call, so this runs small targeted lookups first and
 * unions the results — cheap at this admin console's scale, same posture as
 * the rest of this module (no search indexes/materialized views anywhere
 * else either). Returns an empty array (not null) when nothing matches, so
 * the caller can short-circuit instead of hitting the main table.
 */
async function resolveSearchBookingIds(search: string): Promise<string[]> {
    const term = search.trim();
    if (!term) return [];

    if (UUID_RE.test(term)) {
        const { data, error } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .or(`id.eq.${term},active_rental_id.eq.${term}`);
        if (error) throw error;
        return (data ?? []).map((r) => r.id as string);
    }

    // Escape ilike's own wildcards so a literal '%' or '_' typed by staff
    // doesn't act as one.
    const like = `%${term.replace(/[%_]/g, "\\$&")}%`;
    const [byName, byPhone, byVehicle] = await Promise.all([
        supabaseAdmin.from("users").select("id").ilike("full_name", like),
        supabaseAdmin.from("users").select("id").ilike("phone", like),
        supabaseAdmin.from("vehicles").select("id").ilike("registration_number", like),
    ]);
    if (byName.error) throw byName.error;
    if (byPhone.error) throw byPhone.error;
    if (byVehicle.error) throw byVehicle.error;

    // These ids came back from the DB, not typed by the caller, so it's safe
    // to interpolate them straight into the next .or() below.
    const userIds = [...(byName.data ?? []), ...(byPhone.data ?? [])].map((r) => r.id as string);
    const vehicleIds = (byVehicle.data ?? []).map((r) => r.id as string);
    if (userIds.length === 0 && vehicleIds.length === 0) return [];

    const orParts: string[] = [];
    if (userIds.length) orParts.push(`user_id.in.(${userIds.join(",")})`);
    if (vehicleIds.length) orParts.push(`vehicle_id.in.(${vehicleIds.join(",")})`);

    const { data, error } = await supabaseAdmin.from("bookings").select("id").or(orParts.join(","));
    if (error) throw error;
    return (data ?? []).map((r) => r.id as string);
}

/**
 * Bookings for the admin "Rental Operations" screen, one row per tab: Pending
 * (confirmed), Assigned (fulfilled), Active/Due (fulfilled + planStatus),
 * Return Requests (fulfilled + active_rental.return_requested_at set),
 * Completed, Cancelled, Expired, or All (status/planStatus/returnRequested
 * all omitted — no filter is applied server-side, the caller decides the
 * default view).
 */
export async function listPickupQueue(filters: PickupQueueFilters): Promise<Paginated<PickupBookingView>> {
    const [from, to] = toRange(filters);

    let matchedIds: string[] | null = null;
    if (filters.search?.trim()) {
        matchedIds = await resolveSearchBookingIds(filters.search);
        if (matchedIds.length === 0) return paginate([], 0, filters);
    }

    let query = supabaseAdmin
        .from("bookings")
        .select(pickupBookingColumns({ innerActiveRental: filters.returnRequested }), { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.planStatus) query = query.eq("plan_status", filters.planStatus);
    if (filters.stationId) query = query.eq("station_id", filters.stationId);
    if (filters.returnRequested) query = query.not("active_rental.return_requested_at", "is", null);
    if (filters.unassigned) query = query.is("vehicle_id", null);
    if (matchedIds) query = query.in("id", matchedIds);

    const { data, error, count } = await query
        .order(filters.sortBy, { ascending: filters.sortDir === "asc" })
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
 *
 * Write order is deliberate, not incidental — it's what prevents two racing
 * calls (a double-click, a network retry, two staff confirming the same
 * booking from two tabs) from each creating their own 'assigned' rentals
 * row for the same booking/vehicle:
 *   1. Claim the vehicle with a guarded UPDATE (only succeeds from its
 *      current status) — whoever's update actually matches a row wins.
 *   2. Claim the booking the same way (only succeeds from 'confirmed'). If
 *      this loses the race (someone else already confirmed this exact
 *      booking a moment earlier), the vehicle claim from step 1 is reverted
 *      before returning an error — there's no transaction infra here, so
 *      this compensating write is how a partial failure doesn't strand the
 *      vehicle as 'assigned' with nothing behind it.
 *   3. Only once BOTH claims succeed does the rentals row (the actual
 *      assignment record) get inserted — so at most one can ever exist per
 *      confirmPickup call sequence. rentals_one_active_per_vehicle_idx /
 *      rentals_one_active_per_booking_idx (20260811100000) are the
 *      database-level backstop if any of this is ever bypassed.
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

    // Step 1: claim the vehicle. Guarded on the exact status just read, so a
    // concurrent claim on the SAME vehicle (from this booking retried, or a
    // different booking that also had it allocated) can only ever win once.
    const { data: claimedVehicle, error: vehicleClaimError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "assigned" })
        .eq("id", vehicleId)
        .eq("status", vehicle.status)
        .select("id")
        .maybeSingle();
    if (vehicleClaimError) throw vehicleClaimError;
    if (!claimedVehicle) {
        throw conflict("This vehicle was just assigned elsewhere — refresh and try again.");
    }

    const rider = unwrap<{ id: string; full_name: string; phone: string | null }>(bookingRow.users);
    // The plan is FROZEN onto the rental here rather than read back through
    // booking_id -> bookings -> plans, so a later repricing can't rewrite this
    // rental's deadline or its settled penalty (20260804100000). A booking
    // with no plan leaves those fields null — that rental simply never expires.
    const plan = unwrap<{ id: string; price: number; duration_days: number; deposit_amount: number }>(bookingRow.plans);
    const startedAt = new Date();
    const expiresAt = plan ? planExpiryFor(startedAt, plan.duration_days) : null;

    // Plan/billing rental period starts HERE — at vehicle assignment, never
    // at payment time, per spec. duration_days is snapshotted so a later
    // admin edit to the plan template can't reshape an already-active plan.
    const nowIso = startedAt.toISOString();
    const today = nowIso.slice(0, 10);
    const durationDays = plan?.duration_days ?? 7;
    const nextDueAt = addDays(today, durationDays);

    // Step 2: claim the booking. Guarded on 'confirmed' — if this booking was
    // already fulfilled by a racing call, undo step 1's vehicle claim (it's
    // otherwise left 'assigned' with no rental behind it) and surface a
    // clean, idempotency-friendly error instead of a duplicate assignment.
    const { data: updated, error: bookingUpdateError } = await supabaseAdmin
        .from("bookings")
        .update({
            status: "fulfilled",
            vehicle_id: vehicleId,
            plan_status: "active",
            plan_activated_at: nowIso,
            plan_duration_days: durationDays,
            deposit_amount_at_booking: plan?.deposit_amount ?? null,
            current_period_start: today,
            next_due_at: nextDueAt,
        })
        .eq("id", bookingId)
        .eq("status", "confirmed")
        .select(PICKUP_BOOKING_COLUMNS)
        .maybeSingle();
    if (bookingUpdateError) throw bookingUpdateError;
    if (!updated) {
        await supabaseAdmin.from("vehicles").update({ status: vehicle.status }).eq("id", vehicleId);
        throw conflict("This booking has already been confirmed.");
    }

    // Step 3: only now insert the actual assignment record. rentalError.code
    // 23505 would mean rentals_one_active_per_vehicle_idx /
    // _per_booking_idx caught a duplicate that somehow got past steps 1-2 —
    // translated to the same conflict message rather than a raw DB error.
    const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .insert({
            user_id: rider!.id,
            vehicle_id: vehicleId,
            booking_id: bookingId,
            status: "active",
            started_at: startedAt.toISOString(),
            plan_id: plan?.id ?? null,
            plan_duration_days: plan?.duration_days ?? null,
            plan_price_at_pickup: plan?.price ?? null,
            expires_at: expiresAt?.toISOString() ?? null,
        })
        .select("id")
        .single();
    if (rentalError) {
        if ((rentalError as { code?: string }).code === "23505") {
            throw conflict("This vehicle or booking was just assigned elsewhere — refresh and try again.");
        }
        throw rentalError;
    }

    const { error: activeRentalLinkError } = await supabaseAdmin
        .from("bookings")
        .update({ active_rental_id: rental.id })
        .eq("id", bookingId);
    if (activeRentalLinkError) throw activeRentalLinkError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider!.id,
        action: "booking.fulfilled",
        entityType: "booking",
        entityId: bookingId,
        after: { vehicle_id: vehicleId, status: "fulfilled", expires_at: expiresAt?.toISOString() ?? null },
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider!.id,
        action: "plan.activated",
        entityType: "booking",
        entityId: bookingId,
        after: { plan_status: "active", next_due_at: nextDueAt, plan_duration_days: durationDays },
    });

    await notifyUser(rider!.id, {
        template: "pickup_confirmed",
        title: "Scooter Picked Up",
        body: expiresAt
            ? `Enjoy your ride! Your rental is now active until ${expiresAt.toLocaleDateString()}.`
            : "Enjoy your ride! Your rental is now active.",
        screen: "post-booking-dashboard",
    });

    return toPickupBookingView(updated as unknown as RawPickupBookingRow);
}
