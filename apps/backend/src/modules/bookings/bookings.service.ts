import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { hasActiveRentalForUser } from "../users/users.service";
import { computeLateReturnPenalty } from "../rentals/rentals.service";
import { qualifyReferralIfApplicable } from "../referrals/referrals.service";
import { getDepositForSubscriptionOrNull } from "../deposits/deposits.service";
import { initiateCancellationRefund } from "../refunds/refunds.service";
import { generatePeriodInvoice } from "../billing/billing.service";
import { computeLateRenewalFee, lateFeeOverrideCode } from "../payments/renewalFee";
import { setLateFeeOverride as setSubscriptionLateFeeOverride } from "../subscriptions/subscriptions.service";
import { AuthContext, Paginated } from "../../types";
import {
    ACTIVE_BOOKING_STATUSES, AvailableVehicleView, BookingActiveRental, BookingHistoryFilters,
    BookingLifecycleStatus, BookingRefundStatus, BookingStatus, BookingView, CancelBookingInput,
    ConfirmPickupInput, CreateBookingInput, PickupBookingView, PickupQueueFilters,
} from "./bookings.types";
import { businessToday, endOfBusinessDay } from "../../common/dates";
import {
    FREE_CANCELLATION_GRACE_MINUTES, FREE_CANCELLATION_NOTICE_DAYS, LATE_CANCELLATION_PENALTY_RATE,
} from "./cancellation.constants";

/**
 * Bookings.
 *
 * The booking row is now a reservation and nothing else, so most of what this
 * module reports no longer lives on it. Rather than making every caller issue
 * four extra queries, the assembly happens here: {@link loadBookingContext}
 * fetches the subscription, its current and scheduled periods, its pauses, the
 * cancellation, the refund and the live rental for a whole page of bookings in
 * one batch, and {@link toBookingView} folds them into the flat shape both
 * apps already read.
 *
 * That batching is not incidental. The old `BOOKING_COLUMNS` embed pulled all
 * of this through foreign keys on the booking itself; without it, the obvious
 * translation would be an N+1 on every list endpoint in the admin console.
 */

const BOOKING_COLUMNS = `
    id, user_id, status, requested_start_on, created_at, held_vehicle_id, hold_expires_at,
    plan_price_snapshot, duration_days_snapshot, deposit_amount_snapshot,
    vehicle_models:plans(vehicle_models(id, name)),
    hubs(id, name, code, latitude, longitude),
    plans(id, name, billing_period),
    vehicles:held_vehicle_id(id, display_name, registration_number, status, vehicle_models(name))
`;

type RawBookingRow = {
    id: string;
    user_id: string;
    status: BookingStatus;
    requested_start_on: string;
    created_at: string;
    held_vehicle_id: string | null;
    hold_expires_at: string | null;
    plan_price_snapshot: number | string;
    duration_days_snapshot: number;
    deposit_amount_snapshot: number | string;
    vehicle_models: unknown;
    hubs: unknown;
    plans: unknown;
    vehicles: unknown;
};

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Context assembly — everything that used to be a booking column
// ---------------------------------------------------------------------------

interface BookingContext {
    subscriptionId: string | null;
    planStatus: BookingView["plan_status"];
    /** True when the subscription has ended — what the view reports as `completed`. */
    subscriptionEnded: boolean;
    planActivatedAt: string | null;
    planDurationDays: number | null;
    currentPeriodStart: string | null;
    nextDueAt: string | null;
    pausedAt: string | null;
    pausedDaysTotal: number;
    renewalStatus: "none" | "scheduled";
    scheduledStartDate: string | null;
    scheduledDurationDays: number | null;
    lateFeeOverride: number | null;
    referralDiscountAmount: number | null;
    cancelledAt: string | null;
    cancellationReason: string | null;
    cancellationPenaltyAmount: number | null;
    refundAmount: number | null;
    refundStatus: BookingRefundStatus | null;
    refundInitiatedAt: string | null;
    refundCompletedAt: string | null;
    refundTransactionId: string | null;
    activeRental: BookingActiveRental | null;
    /** The vehicle the rental currently holds, once riding. */
    currentVehicleId: string | null;
}

const EMPTY_CONTEXT: BookingContext = {
    subscriptionId: null, planStatus: null, subscriptionEnded: false, planActivatedAt: null,
    planDurationDays: null, currentPeriodStart: null, nextDueAt: null, pausedAt: null,
    pausedDaysTotal: 0, renewalStatus: "none", scheduledStartDate: null,
    scheduledDurationDays: null, lateFeeOverride: null, referralDiscountAmount: null,
    cancelledAt: null, cancellationReason: null, cancellationPenaltyAmount: null,
    refundAmount: null, refundStatus: null, refundInitiatedAt: null, refundCompletedAt: null,
    refundTransactionId: null, activeRental: null, currentVehicleId: null,
};

/** `refunds.status` → the vocabulary the clients already speak. */
function toRefundStatus(status: string | null | undefined): BookingRefundStatus | null {
    if (!status) return null;
    if (status === "succeeded") return "processed";
    if (status === "pending") return "pending";
    if (status === "processing") return "processing";
    if (status === "failed") return "failed";
    return null;
}

/**
 * Whole days a scheduled period covers, inclusive of both ends — the direct
 * equivalent of the deleted `scheduled_duration_days` column.
 */
function inclusiveDays(startsOn: string, endsOn: string): number {
    const start = Date.parse(`${startsOn}T00:00:00Z`);
    const end = Date.parse(`${endsOn}T00:00:00Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return 0;
    return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Everything a booking used to carry itself, for a whole page at once.
 *
 * Six queries regardless of page size, rather than six per row.
 */
async function loadBookingContext(bookingIds: string[]): Promise<Map<string, BookingContext>> {
    const contexts = new Map<string, BookingContext>();
    if (bookingIds.length === 0) return contexts;

    for (const id of bookingIds) contexts.set(id, { ...EMPTY_CONTEXT });

    const [subsRes, cancellationsRes] = await Promise.all([
        supabaseAdmin
            .from("subscriptions")
            .select("id, booking_id, status, started_on, duration_days_snapshot")
            .in("booking_id", bookingIds),
        supabaseAdmin
            .from("booking_cancellations")
            .select("booking_id, cancelled_at, reason, penalty_amount, refund_id")
            .in("booking_id", bookingIds),
    ]);
    if (subsRes.error) throw subsRes.error;
    if (cancellationsRes.error) throw cancellationsRes.error;

    const bookingBySubscription = new Map<string, string>();
    for (const sub of subsRes.data ?? []) {
        const ctx = contexts.get(sub.booking_id);
        if (!ctx) continue;
        bookingBySubscription.set(sub.id, sub.booking_id);
        ctx.subscriptionId = sub.id;
        ctx.planActivatedAt = sub.started_on;
        ctx.planDurationDays = sub.duration_days_snapshot;
        ctx.subscriptionEnded = sub.status === "ended" || sub.status === "cancelled";
        ctx.planStatus =
            sub.status === "active" || sub.status === "past_due" || sub.status === "paused"
                ? sub.status
                : null;
    }

    const refundIds = (cancellationsRes.data ?? [])
        .map((c) => c.refund_id)
        .filter((id): id is string => !!id);

    const subscriptionIds = [...bookingBySubscription.keys()];

    const [periodsRes, pausesRes, rentalsRes, overridesRes, refundsRes, adjustmentsRes] =
        await Promise.all([
            subscriptionIds.length
                ? supabaseAdmin
                    .from("subscription_periods")
                    .select("subscription_id, status, starts_on, ends_on, due_on")
                    .in("subscription_id", subscriptionIds)
                    .in("status", ["current", "scheduled"])
                : Promise.resolve({ data: [], error: null } as const),
            subscriptionIds.length
                ? supabaseAdmin
                    .from("subscription_pauses")
                    .select("subscription_id, paused_at, resumed_at, days_paused")
                    .in("subscription_id", subscriptionIds)
                : Promise.resolve({ data: [], error: null } as const),
            subscriptionIds.length
                ? supabaseAdmin
                    .from("rentals")
                    .select(`
                        id, subscription_id, status, picked_up_at, due_back_at,
                        rental_returns(requested_at, requested_reason, rider_notes, due_back_at, approved_at),
                        rental_vehicle_assignments(vehicle_id, released_at)
                    `)
                    .in("subscription_id", subscriptionIds)
                    .order("picked_up_at", { ascending: false })
                : Promise.resolve({ data: [], error: null } as const),
            subscriptionIds.length
                ? supabaseAdmin
                    .from("pricing_rules")
                    .select("scope_ref_id, amount")
                    .eq("scope", "subscription")
                    .eq("is_active", true)
                    .in("code", subscriptionIds.map(lateFeeOverrideCode))
                : Promise.resolve({ data: [], error: null } as const),
            refundIds.length
                ? supabaseAdmin
                    .from("refunds")
                    .select("id, amount, status, initiated_at, completed_at, gateway_refund_id")
                    .in("id", refundIds)
                : Promise.resolve({ data: [], error: null } as const),
            subscriptionIds.length
                ? supabaseAdmin
                    .from("subscription_adjustments")
                    .select("subscription_id, amount, code_snapshot")
                    .in("subscription_id", subscriptionIds)
                    .like("code_snapshot", "referral%")
                : Promise.resolve({ data: [], error: null } as const),
        ]);
    if (periodsRes.error) throw periodsRes.error;
    if (pausesRes.error) throw pausesRes.error;
    if (rentalsRes.error) throw rentalsRes.error;
    if (overridesRes.error) throw overridesRes.error;
    if (refundsRes.error) throw refundsRes.error;
    if (adjustmentsRes.error) throw adjustmentsRes.error;

    const ctxFor = (subscriptionId: string | null): BookingContext | undefined => {
        if (!subscriptionId) return undefined;
        const bookingId = bookingBySubscription.get(subscriptionId);
        return bookingId ? contexts.get(bookingId) : undefined;
    };

    for (const period of periodsRes.data ?? []) {
        const ctx = ctxFor(period.subscription_id);
        if (!ctx) continue;
        if (period.status === "current") {
            ctx.currentPeriodStart = period.starts_on;
            ctx.nextDueAt = period.due_on;
        } else {
            ctx.renewalStatus = "scheduled";
            ctx.scheduledStartDate = period.starts_on;
            ctx.scheduledDurationDays = inclusiveDays(period.starts_on, period.ends_on);
        }
    }

    for (const pause of pausesRes.data ?? []) {
        const ctx = ctxFor(pause.subscription_id);
        if (!ctx) continue;
        ctx.pausedDaysTotal += pause.days_paused ?? 0;
        if (!pause.resumed_at) ctx.pausedAt = pause.paused_at;
    }

    for (const rental of rentalsRes.data ?? []) {
        const ctx = ctxFor(rental.subscription_id);
        // Newest first, so the first rental seen per subscription is the live one.
        if (!ctx || ctx.activeRental) continue;

        const ret = unwrap<{
            requested_at: string | null; requested_reason: string | null; rider_notes: string | null;
            due_back_at: string | null; approved_at: string | null;
        }>(rental.rental_returns);

        ctx.activeRental = {
            id: rental.id,
            status: rental.status,
            started_at: rental.picked_up_at,
            return_requested_at: ret?.requested_at ?? null,
            return_reason: ret?.requested_reason ?? null,
            return_feedback: ret?.rider_notes ?? null,
            // An approved return can move the due date; the rental's own is
            // the fallback. This is effectiveDueAt(), inlined.
            return_due_at: ret?.due_back_at ?? rental.due_back_at,
            return_approved_at: ret?.approved_at ?? null,
        };

        const assignments = (Array.isArray(rental.rental_vehicle_assignments)
            ? rental.rental_vehicle_assignments
            : []) as Array<{ vehicle_id: string; released_at: string | null }>;
        ctx.currentVehicleId = assignments.find((a) => !a.released_at)?.vehicle_id ?? null;
    }

    for (const rule of overridesRes.data ?? []) {
        const ctx = ctxFor(rule.scope_ref_id);
        if (ctx) ctx.lateFeeOverride = Number(rule.amount);
    }

    for (const adjustment of adjustmentsRes.data ?? []) {
        const ctx = ctxFor(adjustment.subscription_id);
        // Discounts are stored negative; the API has always reported the
        // referral discount as a positive amount deducted.
        if (ctx) ctx.referralDiscountAmount = Math.abs(Number(adjustment.amount));
    }

    const refundById = new Map((refundsRes.data ?? []).map((r) => [r.id, r]));
    for (const cancellation of cancellationsRes.data ?? []) {
        const ctx = contexts.get(cancellation.booking_id);
        if (!ctx) continue;
        ctx.cancelledAt = cancellation.cancelled_at;
        ctx.cancellationReason = cancellation.reason;
        ctx.cancellationPenaltyAmount = Number(cancellation.penalty_amount);

        const refund = cancellation.refund_id ? refundById.get(cancellation.refund_id) : undefined;
        if (refund) {
            ctx.refundAmount = Number(refund.amount);
            ctx.refundStatus = toRefundStatus(refund.status);
            ctx.refundInitiatedAt = refund.initiated_at;
            ctx.refundCompletedAt = refund.completed_at;
            ctx.refundTransactionId = refund.gateway_refund_id;
        } else {
            // A cancellation with no refund row owed nothing.
            ctx.refundAmount = 0;
            ctx.refundStatus = "not_required";
        }
    }

    return contexts;
}

/**
 * Live estimate of the late-return fee that WOULD be settled if this booking's
 * pending return were approved right now — the same helper the settlement
 * uses, just not written anywhere.
 */
function toReturnLateFeePreview(activeRental: BookingActiveRental | null): BookingView["return_late_fee_preview"] {
    if (!activeRental?.return_requested_at) return null;
    const charge = computeLateReturnPenalty({ returnDueAt: activeRental.return_due_at });
    return { days_late: charge.daysLate, penalty_amount: charge.penaltyAmount, fee_per_day: charge.feePerDay };
}

export function toBookingView(row: RawBookingRow, ctx: BookingContext = EMPTY_CONTEXT): BookingView {
    const plan = unwrap<{ id: string; name: string; billing_period: string }>(row.plans);
    const hub = unwrap<{
        id: string; name: string; code: string; latitude: number | null; longitude: number | null;
    }>(row.hubs);
    const vehicle = unwrap<{
        id: string; display_name: string | null; registration_number: string;
        status: NonNullable<BookingView["vehicle"]>["status"]; vehicle_models: unknown;
    }>(row.vehicles);

    // The model comes through the plan: a booking names a plan, and a plan
    // names exactly one model, so `bookings.vehicle_model_id` was redundant.
    const model = unwrap<{ vehicle_models: unknown }>(row.vehicle_models);
    const modelRef = unwrap<{ id: string; name: string }>(model?.vehicle_models);

    return {
        id: row.id,
        // `completed` is derived, never stored — see bookings.types.ts.
        status: (row.status === "fulfilled" && ctx.subscriptionEnded
            ? "completed"
            : row.status) as BookingLifecycleStatus,
        start_day: row.requested_start_on,
        created_at: row.created_at,
        vehicle_model: modelRef,
        station: hub
            ? { id: hub.id, name: hub.name, code: hub.code, lat: hub.latitude ?? 0, lng: hub.longitude ?? 0 }
            : null,
        plan: plan
            ? {
                id: plan.id,
                name: plan.name,
                billing_cycle: plan.billing_period,
                // Snapshots, not the live plan row.
                price: Number(row.plan_price_snapshot),
                duration_days: row.duration_days_snapshot,
                deposit_amount: Number(row.deposit_amount_snapshot),
            }
            : null,
        vehicle: vehicle
            ? {
                id: vehicle.id,
                name: vehicle.display_name ?? unwrap<{ name: string }>(vehicle.vehicle_models)?.name ?? "",
                registration_number: vehicle.registration_number,
                status: vehicle.status,
            }
            : null,
        referral_discount_amount: ctx.referralDiscountAmount,
        cancelled_at: ctx.cancelledAt,
        cancellation_reason: ctx.cancellationReason,
        // Reconstructed rather than stored: the net owed at cancel time is the
        // agreed price less any discount, which the snapshot and the
        // adjustment together still give exactly.
        plan_price_at_cancellation: ctx.cancelledAt
            ? round2(Math.max(0, Number(row.plan_price_snapshot) - (ctx.referralDiscountAmount ?? 0)))
            : null,
        cancellation_penalty_amount: ctx.cancellationPenaltyAmount,
        refund_amount: ctx.refundAmount,
        refund_status: ctx.refundStatus,
        refund_initiated_at: ctx.refundInitiatedAt,
        refund_completed_at: ctx.refundCompletedAt,
        refund_transaction_id: ctx.refundTransactionId,
        plan_status: ctx.planStatus,
        plan_activated_at: ctx.planActivatedAt,
        plan_duration_days: ctx.planDurationDays,
        deposit_amount_at_booking: Number(row.deposit_amount_snapshot),
        current_period_start: ctx.currentPeriodStart,
        next_due_at: ctx.nextDueAt,
        plan_paused_at: ctx.pausedAt,
        plan_paused_days_total: ctx.pausedDaysTotal,
        renewal_status: ctx.renewalStatus,
        scheduled_start_date: ctx.scheduledStartDate,
        scheduled_duration_days: ctx.scheduledDurationDays,
        late_fee_override: ctx.lateFeeOverride,
        active_rental: ctx.activeRental,
        return_late_fee_preview: toReturnLateFeePreview(ctx.activeRental),
    };
}

/** Reads rows and their context together — the shape every read path wants. */
async function viewsFor(rows: RawBookingRow[]): Promise<BookingView[]> {
    const contexts = await loadBookingContext(rows.map((r) => r.id));
    return rows.map((row) => toBookingView(row, contexts.get(row.id)));
}

// ---------------------------------------------------------------------------
// Rules — unchanged logic, exported for the tests
// ---------------------------------------------------------------------------

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
    /** Plan price minus any referral discount — what the rider would actually have owed. */
    chargeableAmount: number;
    /** Penalty on the rental portion only — the deposit is never the rider's "fault" money. */
    penaltyAmount: number;
    /** The security deposit actually paid — always refunded in full pre-pickup, never penalized. */
    depositRefund: number;
    /** (chargeableAmount - penaltyAmount) + depositRefund. */
    refundAmount: number;
}

/**
 * Cancelling is free when EITHER of these holds:
 *   1. The booking was created within FREE_CANCELLATION_GRACE_MINUTES, or
 *   2. start_day is FREE_CANCELLATION_NOTICE_DAYS or more calendar days out.
 * Otherwise LATE_CANCELLATION_PENALTY_RATE of the net plan price is kept back.
 *
 * The grace period matters because the notice rule alone only asks how close
 * pickup is: a booking made FOR tomorrow is born inside the penalty window and
 * would otherwise be charged seconds after it was created.
 *
 * The penalty applies to the NET price (after any referral discount) — charging
 * a fee on an amount the rider was never going to owe would be wrong. The
 * security deposit is never subject to this penalty: no damage is possible
 * before pickup, so it is always refunded in full.
 *
 * Unchanged by the migration, and exported so the service and the tests
 * exercise the same rule. `now` is injectable for deterministic tests; like
 * isValidStartDay this works in server-local time, never UTC.
 */
export function computeCancellationCharge(input: {
    startDay: string;
    planPrice: number | null;
    discountAmount?: number | null;
    /** The deposit for this booking — omit (or 0) if it was never paid. */
    depositAmount?: number | null;
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

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

/**
 * Best-effort call to `allocate_vehicle_for_booking()` — finds a free unit
 * matching the booking's model/hub and holds it (`held_vehicle_id`, and
 * `recompute_vehicle_status()` derives `reserved` from that). Never throws: a
 * booking with no vehicle available yet is still a valid booking.
 */
async function tryAllocateVehicle(bookingId: string): Promise<void> {
    const { error } = await supabaseAdmin.rpc("allocate_vehicle_for_booking", { p_booking_id: bookingId });
    if (error) {
        console.error("[bookings] allocate_vehicle_for_booking failed", { bookingId, error: error.message });
    }
}

/**
 * A booking is only worth taking if a unit can actually be handed over at that
 * hub. tryAllocateVehicle() is still best-effort — between this count and the
 * insert another rider could take the last one — but that narrow race is very
 * different from cheerfully confirming a booking against an empty hub.
 */
async function assertVehicleAvailable(modelId: string, hubId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("v_vehicle_availability")
        .select("vehicle_count")
        .eq("vehicle_model_id", modelId)
        .eq("hub_id", hubId)
        .eq("status", "available");

    if (error) throw error;
    const available = (data ?? []).reduce((sum, row) => sum + (row.vehicle_count ?? 0), 0);
    if (available === 0) {
        throw businessRule("No scooters of this model are available at that pickup station right now. Try another day or station.");
    }
}

/** The plan must belong to the booked model and still be on sale. */
async function requireBookablePlan(planId: string, modelId: string) {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .select("id, is_active, vehicle_model_id, price_amount, duration_days, deposit_amount")
        .eq("id", planId)
        .is("deleted_at", null)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("That plan could not be found.");
    if (!data.is_active) throw businessRule("That plan is no longer available. Please choose another.");
    if (data.vehicle_model_id !== modelId) {
        throw businessRule("That plan does not apply to the scooter you selected.");
    }
    return data;
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

    const [plan] = await Promise.all([
        requireBookablePlan(input.plan_id, input.vehicle_model_id),
        assertVehicleAvailable(input.vehicle_model_id, input.station_id),
    ]);

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .insert({
            user_id: actor.id,
            hub_id: input.station_id,
            plan_id: input.plan_id,
            requested_start_on: input.start_day,
            // The price, duration and deposit are frozen onto the booking at
            // this moment. `bookings.vehicle_model_id` is gone — the plan
            // names the model, so storing it twice could only ever disagree.
            plan_price_snapshot: plan.price_amount,
            duration_days_snapshot: plan.duration_days,
            deposit_amount_snapshot: plan.deposit_amount,
            // Payment-gated: the rider must pay via POST
            // /payments/bookings/:id/order before this moves to 'confirmed'
            // — see payments.service.ts's applyPaymentSuccess, which is also
            // where the subscription is now born.
            status: "pending_payment",
        })
        .select("id")
        .single();

    if (error) {
        if (error.code === "23514" || error.code === "P0001") {
            throw businessRule("This booking could not be created — check the pickup day and try again.");
        }
        throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: actor.id,
        action: "booking.created",
        entityType: "booking",
        entityId: data.id,
        after: {
            vehicle_model_id: input.vehicle_model_id,
            hub_id: input.station_id,
            plan_id: input.plan_id,
            requested_start_on: input.start_day,
        },
    });

    // Best-effort early reservation. If nothing is free yet the booking is
    // still valid; staff can allocate one manually at pickup time.
    await tryAllocateVehicle(data.id);

    // First-booking referral discount, if this rider was referred and this is
    // genuinely their first booking. The discount is recorded against the
    // subscription when payment creates it — there is no booking column for
    // it any more — so this only marks the referral as qualified here.
    await qualifyReferralIfApplicable(actor.id, actor);

    return getBookingById(data.id);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function readOne(
    build: (q: ReturnType<typeof bookingQuery>) => ReturnType<typeof bookingQuery>,
): Promise<BookingView | null> {
    const { data, error } = await build(bookingQuery()).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const [view] = await viewsFor([data as unknown as RawBookingRow]);
    return view;
}

const bookingQuery = () => supabaseAdmin.from("bookings").select(BOOKING_COLUMNS);

export async function getBookingById(id: string): Promise<BookingView> {
    const view = await readOne((q) => q.eq("id", id));
    if (!view) throw notFound("Booking not found.");
    return view;
}

/**
 * Rider-scoped "get one of my own bookings by id" — unlike getMyCurrentBooking,
 * this also serves a `fulfilled` one, which the Billing screen needs: the
 * subscription state hangs off the booking, so this is how the app keeps
 * showing recurring-billing state after pickup.
 */
export async function getMyBookingById(bookingId: string, userId: string): Promise<BookingView> {
    const view = await readOne((q) => q.eq("id", bookingId).eq("user_id", userId));
    if (!view) throw notFound("Booking not found.");
    return view;
}

export async function getMyCurrentBooking(userId: string): Promise<BookingView> {
    const { data, error } = await bookingQuery()
        .eq("user_id", userId)
        .in("status", [...ACTIVE_BOOKING_STATUSES])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No active booking found.");

    const [view] = await viewsFor([data as unknown as RawBookingRow]);
    return view;
}

/** All of the rider's own bookings, any status, most recent first. */
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
    const items = await viewsFor((data ?? []) as unknown as RawBookingRow[]);
    return paginate(items, count ?? 0, filters);
}

/** Mirrors hasActiveRentalForUser in users.service.ts. pending_payment counts as active. */
export async function hasActiveBookingForUser(userId: string): Promise<boolean> {
    const { count, error } = await supabaseAdmin
        .from("bookings")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", [...ACTIVE_BOOKING_STATUSES]);

    if (error) throw error;
    return (count ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Records the cancellation and, when money is owed back, opens the refund.
 *
 * `booking_cancellations` is one row per cancelled booking, replacing nine
 * columns that sat null on every booking that was never cancelled — and, more
 * usefully, replacing the five-column refund mirror with a foreign key to the
 * refund itself, so the two can no longer disagree.
 *
 * The refund is deliberately NOT sent to the gateway here: a cancellation
 * refund needs staff approval first (POST /refunds/:id/retry, which doubles as
 * "approve"). Failure to open it is logged, not thrown — a DB hiccup must not
 * fail the rider's cancel request.
 */
async function recordCancellation(input: {
    bookingId: string;
    subscriptionId: string | null;
    penaltyAmount: number;
    refundAmount: number;
    reason: string | null;
    actor: AuthContext;
}): Promise<void> {
    let refundId: string | null = null;

    if (input.refundAmount > 0 && input.subscriptionId) {
        try {
            const deposit = await getDepositForSubscriptionOrNull(input.subscriptionId);
            refundId = await initiateCancellationRefund(
                input.subscriptionId,
                deposit?.id ?? null,
                input.refundAmount,
                input.actor,
            );
        } catch (err) {
            console.error("[bookings] opening cancellation refund failed", {
                bookingId: input.bookingId,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    const { error } = await supabaseAdmin.from("booking_cancellations").insert({
        booking_id: input.bookingId,
        cancelled_at: new Date().toISOString(),
        cancelled_by_user_id: input.actor.id,
        reason: input.reason,
        penalty_amount: input.penaltyAmount,
        refund_id: refundId,
    });
    if (error && (error as { code?: string }).code !== "23505") throw error;
}

/**
 * Rider-initiated PRE-PICKUP cancellation, scoped to the caller's own booking.
 *
 * Cancelling within FREE_CANCELLATION_GRACE_MINUTES is always fee-free. If the
 * booking was actually paid for (`confirmed`), the eligible amount — rental
 * minus any penalty, plus the full deposit — is queued as a refund request.
 * A booking still awaiting payment has nothing to refund.
 */
export async function cancelMyBooking(
    bookingId: string,
    input: CancelBookingInput,
    actor: AuthContext,
): Promise<BookingView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, requested_start_on, created_at, held_vehicle_id, plan_price_snapshot")
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
    if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(existing.status)) {
        throw conflict("This booking can no longer be cancelled.");
    }

    // Only a 'confirmed' booking was ever actually paid for.
    const wasPaid = existing.status === "confirmed";
    const context = (await loadBookingContext([bookingId])).get(bookingId) ?? EMPTY_CONTEXT;
    const deposit = wasPaid && context.subscriptionId
        ? await getDepositForSubscriptionOrNull(context.subscriptionId)
        : null;

    const charge = computeCancellationCharge({
        startDay: existing.requested_start_on,
        planPrice: Number(existing.plan_price_snapshot),
        discountAmount: context.referralDiscountAmount,
        depositAmount: deposit?.amount ?? 0,
        createdAt: existing.created_at,
    });

    const penaltyAmount = wasPaid ? charge.penaltyAmount : 0;
    const refundAmount = wasPaid ? charge.refundAmount : 0;

    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({
            status: "cancelled",
            // Releasing the hold is what frees the vehicle:
            // recompute_vehicle_status() reads held_vehicle_id, so clearing it
            // returns the unit to 'available' without touching its status.
            held_vehicle_id: null,
            hold_expires_at: null,
        })
        .eq("id", bookingId)
        .eq("user_id", actor.id)
        // Optimistic-concurrency guard: if staff confirmed pickup between the
        // read above and here, this matches zero rows instead of cancelling a
        // booking that is already fulfilled.
        .in("status", [...ACTIVE_BOOKING_STATUSES])
        .select("id")
        .maybeSingle();

    if (error) throw error;
    if (!updated) throw conflict("This booking can no longer be cancelled.");

    await recordCancellation({
        bookingId,
        subscriptionId: context.subscriptionId,
        penaltyAmount,
        refundAmount,
        reason: input.reason ?? null,
        actor,
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: actor.id,
        action: "booking.cancelled",
        entityType: "booking",
        entityId: bookingId,
        before: {
            status: existing.status,
            held_vehicle_id: existing.held_vehicle_id,
            requested_start_on: existing.requested_start_on,
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

    await notify({
        notificationType: "booking_cancelled",
        referenceType: "booking",
        referenceId: bookingId,
        title: "Booking Cancelled",
        bodyFallback: "{rider} cancelled their booking for {vehicle}.",
        screen: "/bookings",
        riderId: actor.id,
        vehicleId: existing.held_vehicle_id ?? undefined,
        bookingId,
    });

    return getBookingById(bookingId);
}

/**
 * Staff-initiated cancellation. No late-cancellation penalty applies — the
 * rider isn't the one backing out — and whatever was captured is queued as a
 * refund request, same as cancelMyBooking, pending staff approval.
 */
export async function adminCancelBooking(
    bookingId: string,
    reason: string,
    actor: AuthContext,
): Promise<BookingView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, held_vehicle_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (fetchError) throw fetchError;
    if (!existing) throw notFound("Booking not found.");
    if (!(ACTIVE_BOOKING_STATUSES as readonly string[]).includes(existing.status)) {
        throw conflict("Only a pending or confirmed booking can be cancelled.");
    }

    const context = (await loadBookingContext([bookingId])).get(bookingId) ?? EMPTY_CONTEXT;

    // What was actually collected, from the payments themselves rather than an
    // invoice status column — `invoices.payment_status` is gone, and the sum
    // of allocations is the honest answer to "how much did they pay".
    let refundAmount = 0;
    if (context.subscriptionId) {
        const { data: allocations, error: allocationError } = await supabaseAdmin
            .from("payment_allocations")
            .select("amount, invoices!inner(subscription_id)")
            .eq("invoices.subscription_id", context.subscriptionId);
        if (allocationError) throw allocationError;
        refundAmount = (allocations ?? []).reduce((sum, a) => sum + Number(a.amount), 0);
    }

    const { data: updated, error } = await supabaseAdmin
        .from("bookings")
        .update({ status: "cancelled", held_vehicle_id: null, hold_expires_at: null })
        .eq("id", bookingId)
        .in("status", [...ACTIVE_BOOKING_STATUSES])
        .select("id")
        .maybeSingle();
    if (error) throw error;
    if (!updated) throw conflict("This booking can no longer be cancelled.");

    await recordCancellation({
        bookingId,
        subscriptionId: context.subscriptionId,
        penaltyAmount: 0,
        refundAmount,
        reason,
        actor,
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: existing.user_id,
        action: "booking.cancelled",
        entityType: "booking",
        entityId: bookingId,
        before: { status: existing.status, held_vehicle_id: existing.held_vehicle_id },
        after: { status: "cancelled", reason, refund_amount: refundAmount },
    });

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

// ---------------------------------------------------------------------------
// Renewal
// ---------------------------------------------------------------------------

export interface EarlyRechargeLineItem {
    itemType: "plan_fee" | "adjustment" | "deposit";
    label: string;
    amount: number;
}

export interface EarlyRechargeResult {
    invoiceId: string;
    amountDue: number;
    dueDate: string;
    items: EarlyRechargeLineItem[];
    /** True once the period is already past due — a late fee applies. */
    isLate: boolean;
    lateFee: number;
    daysLate: number;
    feePerDay: number;
    total: number;
    scheduledStartDate: string;
}

/**
 * Rider-initiated "Renew Plan" — mints (or reuses) the invoice for the
 * upcoming period at any time, not just the day before it is due.
 *
 * Reuses `generate_period_invoice()` via billing.service.ts — the same
 * function the overdue sweep calls. That function is idempotent at the
 * invoice level (checks `invoices.subscription_period_id` before applying
 * adjustments), but two near-simultaneous calls for the same period (e.g. a
 * double-tapped "Renew") can both pass that check before either commits.
 * The actual duplicate-application guard is the partial unique index
 * `uq_subscription_adjustments_rule_period` (migration 38) plus the
 * `on conflict do nothing` inside `apply_period_adjustments()` — that is what
 * makes a duplicate call a no-op rather than a duplicate charge/discount.
 *
 * The renewal is keyed on the SUBSCRIPTION now, not the booking. A booking
 * that never became a subscription has nothing to renew, and the guard says so
 * rather than reading a `plan_status` column that no longer exists.
 */
export async function requestEarlyRecharge(bookingId: string, actor: AuthContext): Promise<EarlyRechargeResult> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!booking || booking.user_id !== actor.id) throw notFound("Booking not found.");

    const context = (await loadBookingContext([bookingId])).get(bookingId) ?? EMPTY_CONTEXT;

    if (!context.subscriptionId) throw businessRule("This booking has no plan to renew yet.");
    if (context.planStatus !== "active" && context.planStatus !== "past_due") {
        throw businessRule("This plan can't be renewed right now.");
    }
    if (context.renewalStatus === "scheduled") {
        throw businessRule(
            `Your renewal is already scheduled to start on ${context.scheduledStartDate}.`,
        );
    }
    if (!context.nextDueAt) throw businessRule("This booking has no billing period to renew.");

    const { invoiceId } = await generatePeriodInvoice(context.subscriptionId);

    const [{ data: invoice, error: invoiceError }, { data: balance, error: balanceError }] =
        await Promise.all([
            supabaseAdmin
                .from("invoices")
                .select("due_on, total_amount, invoice_items(item_type, description, amount)")
                .eq("id", invoiceId)
                .single(),
            supabaseAdmin
                .from("v_invoice_balances")
                .select("balance_amount")
                .eq("invoice_id", invoiceId)
                .maybeSingle(),
        ]);
    if (invoiceError) throw invoiceError;
    if (balanceError) throw balanceError;

    const rawItems = (invoice.invoice_items ?? []) as unknown as Array<{
        item_type: EarlyRechargeLineItem["itemType"]; description: string; amount: number | string;
    }>;
    const items: EarlyRechargeLineItem[] = rawItems.map((item) => ({
        itemType: item.item_type,
        label: item.description,
        amount: Number(item.amount),
    }));

    const dueDate = invoice.due_on ?? context.nextDueAt;
    const { isLate, lateFee, daysLate, feePerDay } = await computeLateRenewalFee(
        context.subscriptionId, dueDate,
    );
    // What is still owed, not the invoice total — a part-paid renewal must not
    // ask for the whole thing again.
    const amountDue = Number(balance?.balance_amount ?? invoice.total_amount);
    const today = businessToday();

    await writeAudit({
        actorId: actor.id, targetUserId: actor.id, action: "plan.updated",
        entityType: "subscription", entityId: context.subscriptionId,
        after: { early_recharge_invoice_id: invoiceId },
    });

    return {
        invoiceId,
        amountDue,
        dueDate,
        items,
        isLate,
        lateFee,
        daysLate,
        feePerDay,
        total: round2(amountDue + lateFee),
        scheduledStartDate: isLate ? today : dueDate,
    };
}

/**
 * Admin per-subscription override for the late renewal fee.
 *
 * Still addressed by booking id, because that is what the console has, but it
 * writes a subscription-scoped `pricing_rules` row — see
 * subscriptions.service.ts's setLateFeeOverride for why that replaced the
 * `bookings.late_fee_override` column.
 */
export async function setLateFeeOverride(
    bookingId: string, lateFeeOverride: number | null, actor: AuthContext,
): Promise<BookingView> {
    const context = (await loadBookingContext([bookingId])).get(bookingId);
    if (!context?.subscriptionId) {
        throw businessRule("This booking has no plan yet, so there is no late fee to override.");
    }

    await setSubscriptionLateFeeOverride(context.subscriptionId, lateFeeOverride, actor);

    return getBookingById(bookingId);
}

// ---------------------------------------------------------------------------
// Staff pickup queue + confirmation
// ---------------------------------------------------------------------------

const PICKUP_BOOKING_COLUMNS = `
    ${BOOKING_COLUMNS},
    users(id, full_name, phone)
`;

type RawPickupBookingRow = RawBookingRow & { users: unknown };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves a free-text search into a booking-id allowlist. PostgREST can't
 * OR-combine conditions across several embedded tables in one call, so this
 * runs small targeted lookups first and unions the results — cheap at this
 * admin console's scale.
 */
async function resolveSearchBookingIds(search: string): Promise<string[]> {
    const term = search.trim();
    if (!term) return [];

    if (UUID_RE.test(term)) {
        // A rental id is no longer reachable from the booking directly — it
        // hangs off the subscription — so that leg is a two-hop lookup.
        const [byBooking, byRental] = await Promise.all([
            supabaseAdmin.from("bookings").select("id").eq("id", term),
            supabaseAdmin
                .from("rentals")
                .select("subscriptions!inner(booking_id)")
                .eq("id", term),
        ]);
        if (byBooking.error) throw byBooking.error;
        if (byRental.error) throw byRental.error;

        const ids = (byBooking.data ?? []).map((r) => r.id);
        for (const row of byRental.data ?? []) {
            const sub = unwrap<{ booking_id: string }>(row.subscriptions);
            if (sub) ids.push(sub.booking_id);
        }
        return [...new Set(ids)];
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

    const userIds = [...(byName.data ?? []), ...(byPhone.data ?? [])].map((r) => r.id);
    const vehicleIds = (byVehicle.data ?? []).map((r) => r.id);
    if (userIds.length === 0 && vehicleIds.length === 0) return [];

    const orParts: string[] = [];
    if (userIds.length) orParts.push(`user_id.in.(${userIds.join(",")})`);
    // The vehicle leg matches the HELD unit. A vehicle the rider is currently
    // riding is matched through their rental below.
    if (vehicleIds.length) orParts.push(`held_vehicle_id.in.(${vehicleIds.join(",")})`);

    const [direct, viaAssignment] = await Promise.all([
        supabaseAdmin.from("bookings").select("id").or(orParts.join(",")),
        vehicleIds.length
            ? supabaseAdmin
                .from("rental_vehicle_assignments")
                .select("rentals!inner(subscriptions!inner(booking_id))")
                .in("vehicle_id", vehicleIds)
            : Promise.resolve({ data: [], error: null } as const),
    ]);
    if (direct.error) throw direct.error;
    if (viaAssignment.error) throw viaAssignment.error;

    const ids = (direct.data ?? []).map((r) => r.id);
    for (const row of viaAssignment.data ?? []) {
        const rental = unwrap<{ subscriptions: unknown }>(row.rentals);
        const sub = unwrap<{ booking_id: string }>(rental?.subscriptions);
        if (sub) ids.push(sub.booking_id);
    }
    return [...new Set(ids)];
}

/**
 * Bookings for the admin "Rental Operations" screen.
 *
 * Three of its tabs used to be plain column filters on `bookings` and are now
 * filters on the subscription: Active/Due, Scheduled Renewals, and Return
 * Requests. Those are resolved to a booking-id allowlist first, the same way
 * search already was — PostgREST cannot filter a parent by a grandchild.
 */
export async function listPickupQueue(filters: PickupQueueFilters): Promise<Paginated<PickupBookingView>> {
    const [from, to] = toRange(filters);

    const allowlists: string[][] = [];

    if (filters.search?.trim()) {
        allowlists.push(await resolveSearchBookingIds(filters.search));
    }
    if (filters.planStatus || filters.renewalStatus || filters.returnRequested || filters.status === "completed") {
        allowlists.push(await resolveSubscriptionFilterIds(filters));
    }

    // Intersect: every supplied filter must hold.
    let matchedIds: string[] | null = null;
    for (const list of allowlists) {
        matchedIds = matchedIds === null ? list : matchedIds.filter((id) => list.includes(id));
    }
    if (matchedIds !== null && matchedIds.length === 0) return paginate([], 0, filters);

    let query = supabaseAdmin
        .from("bookings")
        .select(PICKUP_BOOKING_COLUMNS, { count: "exact" });

    // `completed` is derived, so it is expressed by the allowlist above plus
    // the stored status the derivation starts from.
    if (filters.status) {
        query = query.eq("status", filters.status === "completed" ? "fulfilled" : filters.status);
    }
    if (filters.stationId) query = query.eq("hub_id", filters.stationId);
    if (filters.unassigned) query = query.is("held_vehicle_id", null);
    if (matchedIds) query = query.in("id", matchedIds);

    const { data, error, count } = await query
        .order(filters.sortBy, { ascending: filters.sortDir === "asc" })
        .range(from, to);

    if (error) throw error;

    const rows = (data ?? []) as unknown as RawPickupBookingRow[];
    const contexts = await loadBookingContext(rows.map((r) => r.id));
    const items = rows.map((row) => ({
        ...toBookingView(row, contexts.get(row.id)),
        rider: unwrap(row.users) as PickupBookingView["rider"],
    }));

    return paginate(items, count ?? 0, filters);
}

/** Booking ids whose SUBSCRIPTION matches the plan-state filters. */
async function resolveSubscriptionFilterIds(filters: PickupQueueFilters): Promise<string[]> {
    let subsQuery = supabaseAdmin.from("subscriptions").select("id, booking_id");

    if (filters.planStatus) subsQuery = subsQuery.eq("status", filters.planStatus);
    if (filters.status === "completed") subsQuery = subsQuery.in("status", ["ended", "cancelled"]);

    const { data: subs, error } = await subsQuery;
    if (error) throw error;

    let candidates = subs ?? [];

    if (filters.renewalStatus === "scheduled") {
        const { data: scheduled, error: scheduledError } = await supabaseAdmin
            .from("subscription_periods")
            .select("subscription_id")
            .eq("status", "scheduled");
        if (scheduledError) throw scheduledError;
        const withScheduled = new Set((scheduled ?? []).map((p) => p.subscription_id));
        candidates = candidates.filter((s) => withScheduled.has(s.id));
    }

    if (filters.returnRequested) {
        const { data: returns, error: returnsError } = await supabaseAdmin
            .from("rental_returns")
            .select("rentals!inner(subscription_id)")
            .in("status", ["requested", "inspected"]);
        if (returnsError) throw returnsError;
        const withReturn = new Set(
            (returns ?? []).flatMap((r) => {
                const rental = unwrap<{ subscription_id: string }>(r.rentals);
                return rental ? [rental.subscription_id] : [];
            }),
        );
        candidates = candidates.filter((s) => withReturn.has(s.id));
    }

    return candidates.map((s) => s.booking_id);
}

/** Available vehicles matching this booking's model + pickup hub. */
export async function listAvailableVehiclesForBooking(bookingId: string): Promise<AvailableVehicleView[]> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("hub_id, plans(vehicle_model_id)")
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) throw notFound("Booking not found.");

    const modelId = unwrap<{ vehicle_model_id: string }>(booking.plans)?.vehicle_model_id;
    if (!modelId) return [];

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, display_name, registration_number, vehicle_models(name)")
        .eq("vehicle_model_id", modelId)
        .eq("hub_id", booking.hub_id)
        .eq("status", "available");

    if (error) throw error;
    return (data ?? []).map((v) => ({
        id: v.id,
        name: v.display_name ?? unwrap<{ name: string }>(v.vehicle_models)?.name ?? "",
        registration_number: v.registration_number,
    }));
}

/**
 * Staff hands over a physical vehicle for a confirmed booking.
 *
 * **This function got much smaller, and the reason matters.** It used to
 * activate the plan as well as open the rental: it wrote `plan_status`,
 * `plan_activated_at`, `next_due_at`, `current_period_start`,
 * `billing_cycle_number` and a duration snapshot onto the booking, because
 * pickup was where the subscription effectively began.
 *
 * The subscription is created on PAYMENT CAPTURE now
 * (payments.service.ts's applyPaymentSuccess), together with its deposit,
 * period #1 and opening invoice. By the time staff hand over a scooter the
 * commercial agreement already exists and its clock is already running, so
 * pickup does one thing: it opens the rental and attaches a vehicle to it.
 *
 * The concurrency story changed with it. The old code claimed the vehicle with
 * a guarded `UPDATE vehicles SET status='assigned' WHERE status=...`, using
 * that as a lock. `status` is read-only now, so the lock is the assignment
 * row: a partial unique index permits one open assignment per vehicle, and the
 * loser of a race gets 23505 on the insert. The booking claim stays a guarded
 * update, which is what stops two rentals being opened for one booking.
 */
export async function confirmPickup(
    bookingId: string,
    input: ConfirmPickupInput,
    actor: AuthContext,
): Promise<PickupBookingView> {
    const { data: booking, error: bookingError } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, status, hub_id, held_vehicle_id, plans(vehicle_model_id)")
        .eq("id", bookingId)
        .maybeSingle();

    if (bookingError) throw bookingError;
    if (!booking) throw notFound("Booking not found.");
    if (booking.status !== "confirmed") throw conflict("This booking is not awaiting pickup.");

    const context = (await loadBookingContext([bookingId])).get(bookingId) ?? EMPTY_CONTEXT;
    if (!context.subscriptionId) {
        throw businessRule(
            "This booking has no subscription yet. Payment must be captured before a scooter can be handed over.",
        );
    }

    const modelId = unwrap<{ vehicle_model_id: string }>(booking.plans)?.vehicle_model_id;
    const vehicleId = input.vehicle_id ?? booking.held_vehicle_id;
    if (!vehicleId) {
        throw businessRule("No vehicle has been allocated to this booking yet — pick one manually.");
    }

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, status, hub_id, vehicle_model_id")
        .eq("id", vehicleId)
        .maybeSingle();

    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");
    // 'reserved' is the normal path (already held by this booking);
    // 'available' covers a manual override onto a unit never auto-allocated.
    if (vehicle.status !== "reserved" && vehicle.status !== "available") {
        throw businessRule("This vehicle is not available for pickup.");
    }
    if (vehicle.hub_id !== booking.hub_id) {
        throw businessRule("This vehicle is not at the booking's pickup station.");
    }
    if (vehicle.vehicle_model_id !== modelId) {
        throw businessRule("This vehicle does not match the booked model.");
    }

    // The rental runs to the end of the current billing period. That date is
    // the period's, not a duration added to "now": the clock started when the
    // rider paid, so a scooter collected two days late is still due back on
    // the same day.
    if (!context.nextDueAt) {
        throw businessRule("This subscription has no current billing period to rent against.");
    }
    // End of the IST day, not `T23:59:59Z` — that is 05:29:59 IST the next
    // morning, and it handed every rental five and a half hours before
    // computeLateReturnPenalty considered it late.
    const dueBackAt = endOfBusinessDay(context.nextDueAt);

    // Step 1: claim the booking. Guarded on 'confirmed', so a racing call
    // cannot also open a rental for it.
    const { data: claimedBooking, error: claimError } = await supabaseAdmin
        .from("bookings")
        .update({ status: "fulfilled", held_vehicle_id: null, hold_expires_at: null })
        .eq("id", bookingId)
        .eq("status", "confirmed")
        .select("id")
        .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedBooking) throw conflict("This booking has already been confirmed.");

    // Step 2: open the rental.
    const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .insert({
            user_id: booking.user_id,
            subscription_id: context.subscriptionId,
            status: "active",
            picked_up_at: new Date().toISOString(),
            due_back_at: dueBackAt,
        })
        .select("id")
        .single();
    if (rentalError) {
        // Compensating write — put the booking back so staff can retry.
        await supabaseAdmin
            .from("bookings")
            .update({ status: "confirmed", held_vehicle_id: vehicleId })
            .eq("id", bookingId);
        if ((rentalError as { code?: string }).code === "23505") {
            throw conflict("This rider already has an active rental — refresh and try again.");
        }
        throw rentalError;
    }

    // Step 3: attach the vehicle. The unique index on open assignments is what
    // makes this the real mutual exclusion.
    const { error: assignmentError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .insert({
            rental_id: rental.id,
            vehicle_id: vehicleId,
            reason: "initial",
            assigned_hub_id: booking.hub_id,
        });
    if (assignmentError) {
        await supabaseAdmin.from("rentals").delete().eq("id", rental.id);
        await supabaseAdmin
            .from("bookings")
            .update({ status: "confirmed", held_vehicle_id: vehicleId })
            .eq("id", bookingId);
        if ((assignmentError as { code?: string }).code === "23505") {
            throw conflict("This vehicle was just assigned elsewhere — refresh and try again.");
        }
        throw assignmentError;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: booking.user_id,
        action: "booking.fulfilled",
        entityType: "booking",
        entityId: bookingId,
        after: { vehicle_id: vehicleId, status: "fulfilled", rental_id: rental.id, due_back_at: dueBackAt },
    });

    await notifyUser(booking.user_id, {
        template: "pickup_confirmed",
        title: "Scooter Picked Up",
        body: `Enjoy your ride! Your rental is now active until ${context.nextDueAt}.`,
        screen: "post-booking-dashboard",
    });

    const { data: refreshed, error: refreshError } = await supabaseAdmin
        .from("bookings")
        .select(PICKUP_BOOKING_COLUMNS)
        .eq("id", bookingId)
        .single();
    if (refreshError) throw refreshError;

    const row = refreshed as unknown as RawPickupBookingRow;
    const contexts = await loadBookingContext([bookingId]);
    return {
        ...toBookingView(row, contexts.get(bookingId)),
        rider: unwrap(row.users) as PickupBookingView["rider"],
    };
}
