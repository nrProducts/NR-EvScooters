import { supabaseAdmin } from "../../config/supabase";
import { businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { pauseSubscription } from "../subscriptions/subscriptions.service";
import { getDepositForSubscriptionOrNull, setDepositRefundEligible } from "../deposits/deposits.service";
import { AuthContext, Paginated } from "../../types";
import {
    AdminRentalRow, CompleteRideInput, ListRentalsFilters, MoveToMaintenanceInput, RejectReturnInput, RentalView,
    RequestReturnInput,
} from "./rentals.types";
import { LATE_RETURN_FEE_PER_DAY, MAX_LATE_PENALTY_DAYS } from "./returnPolicy.constants";
import { paidPeriodIds } from "../payments/renewalPeriod";
import { businessToday } from "../../common/dates";
import { getSettings as getReturnRecoverySettings } from "../return-recovery-settings/return-recovery-settings.service";
import {
    ensureOverdueLateFeeInvoice, isOverdueLateFeeSettled, OverdueLateFeeInvoiceResult, overdueLateFeeStatusFor,
    previewOverdueLateFee,
} from "./overdueLateFee";

/**
 * Rentals.
 *
 * Three structural changes, each of which removes a workaround rather than
 * just renaming something:
 *
 *   **No `vehicle_id`.** A rental can change vehicle mid-term, so the vehicle
 *   is a `rental_vehicle_assignments` row and `v_rental_current_vehicle`
 *   resolves the open one. This is why maintenance no longer has to close a
 *   rental and open another one for a temp swap.
 *
 *   **No return columns.** The eight `return_*` fields are a `rental_returns`
 *   row with its own status. Rejecting a return used to mean nulling four
 *   columns back out, which lost the fact that a return had ever been asked
 *   for; it is a `rejected` row now.
 *
 *   **No plan snapshot.** `plan_id`, `plan_price_at_pickup` and `expires_at`
 *   were frozen at pickup. The subscription holds the agreement and the
 *   current period holds the dates, so a renewal actually moves the deadline
 *   instead of leaving `expires_at` describing week one forever.
 *
 * The API shape is preserved — Stage 10 changes the clients, not this stage —
 * so the flattening happens here.
 */

/** The return workflow, embedded from its own table. */
const RETURN_EMBED = `
    rental_returns(
        requested_at, requested_reason, rider_notes, due_back_at, status,
        approved_at, inspected_at,
        late_fee_amount, other_charges_amount, additional_due_invoice_id, payment_verified_at,
        approved_by:users!approved_by_user_id(id, full_name),
        inspected_by:users!inspected_by_user_id(id, full_name)
    )
`;

/** The settlement, once staff have taken delivery. */
const SETTLEMENT_EMBED = "rental_settlements(late_fee_amount, settled_at)";

/** The agreement this rental is under. */
const SUBSCRIPTION_EMBED = `
    subscriptions(
        id, booking_id, status, plan_price_snapshot, duration_days_snapshot,
        plans(id, name, billing_period),
        bookings(hubs(id, name, code))
    )
`;

/** The vehicle currently in the rider's hands. */
const ASSIGNMENT_EMBED = `
    rental_vehicle_assignments(
        vehicle_id, released_at,
        vehicles(id, display_name, registration_number, vehicle_models(name))
    )
`;

const RENTAL_COLUMNS = `
    id, status, picked_up_at, returned_at, due_back_at, subscription_id, recovery_flagged_at,
    ${RETURN_EMBED}, ${SETTLEMENT_EMBED}, ${SUBSCRIPTION_EMBED}, ${ASSIGNMENT_EMBED}
`;

const ADMIN_RENTAL_COLUMNS = `
    ${RENTAL_COLUMNS},
    users(id, full_name, phone)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

// ---------------------------------------------------------------------------
// Pure rules — unchanged, exported for the tests
// ---------------------------------------------------------------------------

/** End of the calendar day `at` falls on, in server-local time. */
export function returnDeadlineFor(at: Date): Date {
    const due = new Date(at);
    due.setHours(23, 59, 59, 999);
    return due;
}

/**
 * When a plan bought on `startedAt` runs out. Day 1 is the pickup day, so a
 * 30-day plan runs through the end of day 30 — not day 31.
 *
 * Retained because the tests exercise it and the arithmetic is still correct,
 * but nothing in the service calls it now: the period's `ends_on` is the
 * authority on when a plan runs out, and the database computes it.
 */
export function planExpiryFor(startedAt: Date, durationDays: number): Date {
    const expires = new Date(startedAt);
    expires.setDate(expires.getDate() + durationDays - 1);
    return returnDeadlineFor(expires);
}

/**
 * The rider's real deadline: `COALESCE(rental_returns.due_back_at, rentals.due_back_at)`.
 *
 * Same rule as before, different sources. An early return request overrides
 * the rental's own deadline with the (necessarily earlier) request-day one;
 * requestReturn clamps when writing it, so this can never move a deadline
 * later than the plan allowed.
 */
export function effectiveDueAt(row: { return_due_at: string | null; expires_at: string | null }): string | null {
    return row.return_due_at ?? row.expires_at;
}

export interface LateReturnCharge {
    /** Whole calendar days the handover day is past the due day; 0 when on time. */
    daysLate: number;
    isLate: boolean;
    feePerDay: number;
    penaltyAmount: number;
    /** false when the rental had no deadline at all. */
    hadDeadline: boolean;
}

/**
 * Flat fee per whole calendar day past the deadline. Compares CALENDAR DAYS,
 * not elapsed hours: handing over at 23:59 on the due day is 0 days late,
 * 00:30 the next morning is 1. That is deliberate under a per-day fee and is
 * what the rider-facing warning states.
 *
 * A null/unparseable due date means the rental had NO deadline, and those must
 * not be retro-penalised, so this fails open with a zero charge.
 */
export function computeLateReturnPenalty(input: {
    returnDueAt: string | null;
    now?: Date;
    /** Admin-configured cap (return_recovery_settings.max_late_fee_days). Defaults to MAX_LATE_PENALTY_DAYS when omitted, so every existing call site and test keeps compiling unchanged. */
    maxDays?: number;
    /**
     * Admin-configured rate (return_recovery_settings.late_fee_per_day).
     * Defaults to LATE_RETURN_FEE_PER_DAY when omitted, same reasoning as
     * maxDays — and that default is now only the tests and the mock
     * repository.
     *
     * It used to BE the constant, unconditionally, which is how the rider
     * ended up being quoted ₹100/day on the home screen for a fee the admin
     * console had set to something else entirely.
     */
    feePerDay?: number;
}): LateReturnCharge {
    const feePerDay = input.feePerDay ?? LATE_RETURN_FEE_PER_DAY;
    const cap = input.maxDays ?? MAX_LATE_PENALTY_DAYS;

    if (!input.returnDueAt) {
        return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadDeadline: false };
    }

    const due = new Date(input.returnDueAt);
    if (Number.isNaN(due.getTime())) {
        return { daysLate: 0, isLate: false, feePerDay, penaltyAmount: 0, hadDeadline: false };
    }

    const dueDay = new Date(due);
    dueDay.setHours(0, 0, 0, 0);
    const returnDay = input.now ? new Date(input.now) : new Date();
    returnDay.setHours(0, 0, 0, 0);

    // Math.round rather than floor: a DST shift makes the gap 23 or 25 hours,
    // which would otherwise slide the boundary by a whole day.
    const rawDaysLate = Math.round((returnDay.getTime() - dueDay.getTime()) / 86_400_000);
    const daysLate = Math.min(Math.max(0, rawDaysLate), cap);

    return {
        daysLate,
        isLate: daysLate > 0,
        feePerDay,
        penaltyAmount: Math.round(daysLate * feePerDay * 100) / 100,
        hadDeadline: true,
    };
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface RawRentalRow {
    id: string;
    status: RentalView["status"];
    picked_up_at: string;
    returned_at: string | null;
    due_back_at: string;
    subscription_id: string;
    recovery_flagged_at: string | null;
    rental_returns: unknown;
    rental_settlements: unknown;
    subscriptions: unknown;
    rental_vehicle_assignments: unknown;
    users?: unknown;
}

interface RawReturn {
    requested_at: string | null;
    requested_reason: string | null;
    rider_notes: string | null;
    due_back_at: string | null;
    status: string;
    approved_at: string | null;
    inspected_at: string | null;
    late_fee_amount: number | string | null;
    other_charges_amount: number | string | null;
    additional_due_invoice_id: string | null;
    payment_verified_at: string | null;
    approved_by: unknown;
    inspected_by: unknown;
}

/**
 * The OPEN return, if any.
 *
 * A rental can accumulate several `rental_returns` rows over its life — asked
 * for, rejected, asked for again — so "is a return pending" is the presence of
 * one that is neither rejected nor already approved, not the presence of any
 * row at all. That distinction is what the old nulled-out columns could not make.
 */
function openReturn(raw: unknown): RawReturn | null {
    const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as RawReturn[];
    return rows.find((r) => r.status === "requested" || r.status === "inspected") ?? null;
}

/** The most recent return of any status — what history should show. */
function latestReturn(raw: unknown): RawReturn | null {
    const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as RawReturn[];
    if (rows.length === 0) return null;
    return [...rows].sort((a, b) => (b.requested_at ?? "").localeCompare(a.requested_at ?? ""))[0];
}

function currentVehicle(raw: unknown): { id: string; name: string; registration_number: string } | null {
    const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{
        vehicle_id: string; released_at: string | null; vehicles: unknown;
    }>;
    const open = rows.find((a) => !a.released_at) ?? rows[0];
    if (!open) return null;
    const v = unwrap<{
        id: string; display_name: string | null; registration_number: string; vehicle_models: unknown;
    }>(open.vehicles);
    if (!v) return null;
    return {
        id: v.id,
        name: v.display_name ?? unwrap<{ name: string }>(v.vehicle_models)?.name ?? "",
        registration_number: v.registration_number,
    };
}

interface SubscriptionSlice {
    id: string;
    booking_id: string;
    status: string;
    plan_price_snapshot: number | string;
    duration_days_snapshot: number;
    plans: unknown;
    bookings: unknown;
}

/**
 * The current and scheduled period dates for a batch of subscriptions.
 *
 * Separate from the main select because a period is a grandchild of the
 * rental; embedding it would not let us pick the `current` one, and doing it
 * per row would be an N+1 on the admin list.
 */
async function periodsFor(subscriptionIds: string[]): Promise<Map<string, {
    currentStart: string | null; nextDue: string | null; scheduledStart: string | null;
}>> {
    const map = new Map<string, {
        currentStart: string | null; nextDue: string | null; scheduledStart: string | null;
    }>();
    if (subscriptionIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("subscription_periods")
        .select("id, subscription_id, status, starts_on, due_on")
        .in("subscription_id", subscriptionIds)
        .in("status", ["current", "scheduled"]);
    if (error) throw error;

    // Only a PAID scheduled period is a renewal — the renewal preview writes
    // the row before any money arrives. Without this the rider's own screen
    // would report "renewal scheduled" the moment they opened the bill.
    const paid = await paidPeriodIds(
        (data ?? []).filter((row) => row.status === "scheduled").map((row) => row.id),
    );

    for (const row of data ?? []) {
        const entry = map.get(row.subscription_id)
            ?? { currentStart: null, nextDue: null, scheduledStart: null };
        if (row.status === "current") {
            entry.currentStart = row.starts_on;
            entry.nextDue = row.due_on;
        } else if (paid.has(row.id)) {
            entry.scheduledStart = row.starts_on;
        }
        map.set(row.subscription_id, entry);
    }
    return map;
}

type PeriodInfo = { currentStart: string | null; nextDue: string | null; scheduledStart: string | null };

function toReturnFields(row: RawRentalRow, feePerDay: number) {
    const ret = latestReturn(row.rental_returns);
    const settlement = unwrap<{ late_fee_amount: number | string; settled_at: string }>(row.rental_settlements);
    const lateFee = settlement ? Number(settlement.late_fee_amount) : null;

    return {
        return_requested_at: ret?.requested_at ?? null,
        return_reason: ret?.requested_reason ?? null,
        return_feedback: ret?.rider_notes ?? null,
        return_due_at: ret?.due_back_at ?? row.due_back_at,
        return_approved_at: ret?.approved_at ?? null,
        // days_late is not stored — the settlement records the money, and the
        // day count is that money divided by the rate. Recomputing it keeps
        // one source of truth rather than two that can disagree. Uses
        // today's configured rate, same caveat as elsewhere: a rate change
        // after settlement would recompute an old settlement's days_late
        // wrong — accepted, same as the admin-configured cap already was.
        // Zero is a legal rate (the fee switched off), and dividing by it
        // would yield Infinity, so it reports no day count instead.
        days_late: lateFee === null || feePerDay <= 0 ? null : Math.round(lateFee / feePerDay),
        late_penalty_amount: lateFee,
        late_fee_per_day: lateFee === null ? null : feePerDay,
    };
}

function toPlanFields(subscription: SubscriptionSlice | null, row: RawRentalRow) {
    const plan = subscription ? unwrap<{ id: string; name: string; billing_period: string }>(subscription.plans) : null;
    return {
        plan_id: plan?.id ?? null,
        plan_duration_days: subscription?.duration_days_snapshot ?? null,
        plan_price_at_pickup: subscription ? Number(subscription.plan_price_snapshot) : null,
        expires_at: row.due_back_at,
    };
}

function narrowPlanStatus(status: string | undefined): RentalView["plan_status"] {
    return status === "active" || status === "past_due" || status === "paused" ? status : null;
}

/**
 * Both admin-configured return numbers travel with every rental view: the day
 * cap and the per-day rate, so the rider's screens quote the same figures the
 * settlement will charge instead of a constant compiled into the app.
 */
function toRentalView(
    row: RawRentalRow,
    periods: Map<string, PeriodInfo>,
    maxLateFeeDays: number,
    lateReturnFeePerDay: number,
): RentalView {
    const subscription = unwrap<SubscriptionSlice>(row.subscriptions);
    const plan = subscription ? unwrap<{ id: string; name: string; billing_period: string }>(subscription.plans) : null;
    const booking = subscription ? unwrap<{ hubs: unknown }>(subscription.bookings) : null;
    const period = subscription ? periods.get(subscription.id) : undefined;

    return {
        id: row.id,
        status: row.status,
        started_at: row.picked_up_at,
        ended_at: row.returned_at,
        booking_id: subscription?.booking_id ?? null,
        vehicle: currentVehicle(row.rental_vehicle_assignments),
        station: booking ? unwrap(booking.hubs) : null,
        plan: plan
            ? {
                id: plan.id,
                name: plan.name,
                billing_cycle: plan.billing_period,
                price: Number(subscription!.plan_price_snapshot),
            }
            : null,
        plan_status: narrowPlanStatus(subscription?.status),
        next_due_at: period?.nextDue ?? null,
        current_period_start: period?.currentStart ?? null,
        renewal_status: period?.scheduledStart ? "scheduled" : "none",
        scheduled_start_date: period?.scheduledStart ?? null,
        recovery_flagged_at: row.recovery_flagged_at,
        max_late_fee_days: maxLateFeeDays,
        late_return_fee_per_day: lateReturnFeePerDay,
        ...toReturnFields(row, lateReturnFeePerDay),
        ...toPlanFields(subscription, row),
    };
}

function toAdminRentalRow(
    row: RawRentalRow,
    periods: Map<string, PeriodInfo>,
    lateReturnFeePerDay: number,
    overdueLateFees: Map<string, { isLate: boolean; daysLate: number; lateFee: number; isSettled: boolean }>,
): AdminRentalRow {
    const subscription = unwrap<SubscriptionSlice>(row.subscriptions);
    const ret = latestReturn(row.rental_returns);
    const overdue = subscription ? overdueLateFees.get(subscription.id) ?? null : null;

    return {
        id: row.id,
        status: row.status,
        started_at: row.picked_up_at,
        ended_at: row.returned_at,
        // No columns back these — see the note on AdminRentalRow.
        start_battery_pct: null,
        end_battery_pct: null,
        fare: null,
        rider: unwrap(row.users),
        vehicle: currentVehicle(row.rental_vehicle_assignments),
        return_approved_by: ret ? unwrap<{ id: string; full_name: string }>(ret.approved_by) : null,
        inspected_at: ret?.inspected_at ?? null,
        inspected_by: ret ? unwrap<{ id: string; full_name: string }>(ret.inspected_by) : null,
        recovery_flagged_at: row.recovery_flagged_at,
        overdue_late_fee: overdue
            ? { isLate: overdue.isLate, daysLate: overdue.daysLate, lateFee: overdue.lateFee, isSettled: overdue.isSettled }
            : null,
        ...toReturnFields(row, lateReturnFeePerDay),
        ...toPlanFields(subscription, row),
    };
}

/** Reads rows and their period dates together. */
async function withPeriods(rows: RawRentalRow[]): Promise<Map<string, PeriodInfo>> {
    const ids = rows
        .map((r) => unwrap<SubscriptionSlice>(r.subscriptions)?.id)
        .filter((id): id is string => !!id);
    return periodsFor([...new Set(ids)]);
}

// ---------------------------------------------------------------------------
// Rider
// ---------------------------------------------------------------------------

async function getMyActiveSubscriptionId(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select("subscription_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("picked_up_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("No active rental found.");
    return data.subscription_id;
}

/** Pure preview for the Return-flow warning — see overdueLateFee.ts. Safe on every screen load. */
export async function getMyOverdueLateFee(userId: string) {
    const subscriptionId = await getMyActiveSubscriptionId(userId);
    const [preview, isSettled] = await Promise.all([
        previewOverdueLateFee(subscriptionId),
        isOverdueLateFeeSettled(subscriptionId),
    ]);
    return { ...preview, isSettled };
}

/** Creates (or reuses) the payable invoice — see overdueLateFee.ts. Mobile pays it through the normal invoice-order flow. */
export async function payMyOverdueLateFee(userId: string): Promise<OverdueLateFeeInvoiceResult> {
    return ensureOverdueLateFeeInvoice(await getMyActiveSubscriptionId(userId), userId);
}

/** The rider's own currently-active rental — what post-booking-dashboard renders. */
export async function getMyCurrentRental(userId: string): Promise<RentalView> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(RENTAL_COLUMNS)
        .eq("user_id", userId)
        .eq("status", "active")
        .order("picked_up_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("No active rental found.");

    const row = data as unknown as RawRentalRow;
    const { max_late_fee_days, late_fee_per_day } = await getReturnRecoverySettings();
    return toRentalView(row, await withPeriods([row]), max_late_fee_days, late_fee_per_day);
}

/**
 * Rider asks to hand the scooter back. This deliberately does NOT end the
 * rental — it opens a `rental_returns` row and leaves the rental `active`.
 *
 * Two reasons, both load-bearing and both unchanged by the migration:
 *   1. Ending the rental would release the vehicle assignment, and
 *      `recompute_vehicle_status()` would put a scooter the rider still
 *      physically holds back into the bookable pool.
 *   2. Lateness can only be measured at the moment of physical handover, so
 *      the ride must stay open until staff confirm it.
 */
export async function requestReturn(
    rentalId: string,
    input: RequestReturnInput,
    actor: AuthContext,
): Promise<RentalView> {
    const { data: existing, error: fetchError } = await supabaseAdmin
        .from("rentals")
        .select(`
            id, user_id, status, due_back_at, subscription_id,
            rental_returns(status),
            rental_vehicle_assignments(vehicle_id, released_at),
            subscriptions(id, booking_id)
        `)
        .eq("id", rentalId)
        .maybeSingle();

    if (fetchError) throw fetchError;
    // 404 rather than 403 for someone else's rental: a 403 would confirm the
    // id exists, letting a caller probe for other riders' rental ids.
    if (!existing || existing.user_id !== actor.id) throw notFound("Rental not found.");
    if (existing.status !== "active") throw conflict("This rental is no longer active.");

    if (openReturn(existing.rental_returns)) {
        throw conflict("You've already requested a return for this scooter.");
    }

    // Riders can't back out mid-period — only once the current committed
    // period is up. Anchored to the period's due date, which rolls forward on
    // every renewal. No period at all fails open — nothing to gate against.
    const subscription = unwrap<{ id: string; booking_id: string }>(existing.subscriptions);
    const period = subscription ? (await periodsFor([subscription.id])).get(subscription.id) : undefined;
    const todayIso = businessToday();
    if (period?.nextDue && todayIso < period.nextDue) {
        throw businessRule(
            `You can return your scooter once your current plan period ends on ${period.nextDue}.`,
        );
    }

    // An overdue rider (past their plan's due date, unpaid) owes the same
    // renewal late fee a late RENEWAL would charge — see overdueLateFee.ts.
    // Enforced here, not just hidden in the UI, so a direct API call cannot
    // skip it (Final Requirement: "backend-enforced payment gate").
    if (subscription) {
        const settled = await isOverdueLateFeeSettled(subscription.id);
        if (!settled) {
            throw businessRule("Late fee payment required before vehicle return.");
        }
    }

    const { late_fee_per_day } = await getReturnRecoverySettings();

    const now = new Date();
    // Clamped to the rental's own deadline: a rider already days past it would
    // otherwise request a return and get a deadline of TODAY, wiping out the
    // overrun they have already accrued.
    const rentalDue = new Date(existing.due_back_at);
    const requestDeadline = returnDeadlineFor(now);
    const dueAt = !Number.isNaN(rentalDue.getTime()) && rentalDue < requestDeadline
        ? rentalDue
        : requestDeadline;

    const { error } = await supabaseAdmin.from("rental_returns").insert({
        rental_id: rentalId,
        requested_at: now.toISOString(),
        requested_reason: input.reason,
        rider_notes: input.feedback ?? null,
        due_back_at: dueAt.toISOString(),
        status: "requested",
    });
    if (error) {
        // A unique index on one open return per rental is what makes a
        // double-tap safe; translate it rather than surfacing 23505.
        if ((error as { code?: string }).code === "23505") {
            throw conflict("You've already requested a return for this scooter.");
        }
        throw error;
    }

    // Best-effort: a feedback write must never roll back an accepted return
    // request. `rental_feedback` is keyed by rental_id, so a re-submit updates.
    const { error: feedbackError } = await supabaseAdmin
        .from("rental_feedback")
        .upsert(
            { rental_id: rentalId, rating: input.rating, comment: input.feedback ?? null },
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
        entityType: "rental_return",
        entityId: rentalId,
        after: {
            return_reason: input.reason,
            due_back_at: dueAt.toISOString(),
            rating: input.rating,
        },
    });

    // `late_fee_per_day` is read above, off return_recovery_settings — the
    // configured rate rather than the constant, so the rider is never quoted a
    // number the settlement will not charge.
    await notifyUser(actor.id, {
        template: "rental_return_requested",
        title: "Return Requested",
        body: `Hand your scooter in by ${dueAt.toLocaleDateString()} 11:59 PM. Our team will confirm the handover.`
            + (late_fee_per_day > 0 ? ` A late fee of ₹${late_fee_per_day} per day applies after that.` : ""),
        screen: "post-booking-dashboard",
    });

    const assignments = (Array.isArray(existing.rental_vehicle_assignments)
        ? existing.rental_vehicle_assignments
        : []) as Array<{ vehicle_id: string; released_at: string | null }>;

    await notify({
        notificationType: "rental_return_requested",
        referenceType: "rental",
        referenceId: rentalId,
        title: "Return Requested",
        bodyFallback: "{rider} requested a return for {vehicle}.",
        screen: "/bookings",
        riderId: actor.id,
        vehicleId: assignments.find((a) => !a.released_at)?.vehicle_id,
        bookingId: subscription?.booking_id,
    });

    return getMyCurrentRental(actor.id);
}

/** All of the rider's own rentals, most recent first. */
export async function getMyRentalHistory(
    userId: string,
    filters: { page: number; pageSize: number },
): Promise<Paginated<RentalView>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("rentals")
        .select(RENTAL_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("picked_up_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    const rows = (data ?? []) as unknown as RawRentalRow[];
    const periods = await withPeriods(rows);
    const { max_late_fee_days, late_fee_per_day } = await getReturnRecoverySettings();
    return paginate(
        rows.map((r) => toRentalView(r, periods, max_late_fee_days, late_fee_per_day)),
        count ?? 0,
        filters,
    );
}

// ---------------------------------------------------------------------------
// Admin — "Ride Management"
// ---------------------------------------------------------------------------

export async function listRentals(filters: ListRentalsFilters): Promise<Paginated<AdminRentalRow>> {
    let query = supabaseAdmin.from("rentals").select(ADMIN_RENTAL_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.recoveryRequired) query = query.not("recovery_flagged_at", "is", null);

    const [from, to] = toRange(filters);
    query = query.order("picked_up_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawRentalRow[];
    const periods = await withPeriods(rows);
    const { late_fee_per_day } = await getReturnRecoverySettings();
    const overdueLateFees = await overdueLateFeeStatusFor(
        rows.map((r) => unwrap<SubscriptionSlice>(r.subscriptions)?.id).filter((id): id is string => !!id),
    );
    return paginate(
        rows.map((r) => toAdminRentalRow(r, periods, late_fee_per_day, overdueLateFees)),
        count ?? 0,
        filters,
    );
}

export async function getRentalById(id: string): Promise<AdminRentalRow> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(ADMIN_RENTAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Rental not found.");
    const row = data as unknown as RawRentalRow;
    const { late_fee_per_day } = await getReturnRecoverySettings();
    const subscriptionId = unwrap<SubscriptionSlice>(row.subscriptions)?.id;
    const overdueLateFees = await overdueLateFeeStatusFor(subscriptionId ? [subscriptionId] : []);
    return toAdminRentalRow(row, await withPeriods([row]), late_fee_per_day, overdueLateFees);
}

async function requireActiveRental(id: string): Promise<RawRentalRow> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(ADMIN_RENTAL_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Rental not found.");
    const row = data as unknown as RawRentalRow;
    if (row.status !== "active") throw businessRule("This ride is not active.");
    return row;
}

/**
 * A return can no longer settle with a held deposit still un-inspected. A
 * no-op when there is nothing at stake (no deposit, already forfeited or
 * released, or already inspected — recordDamage stamps that the moment a
 * damage item is entered).
 */
async function assertInspected(before: RawRentalRow, input: { inspected?: boolean }): Promise<void> {
    const ret = latestReturn(before.rental_returns);
    if (ret?.inspected_at) return;

    const deposit = await getDepositForSubscriptionOrNull(before.subscription_id);
    if (!deposit || deposit.amount <= 0 || deposit.status !== "held") return;
    if (!input.inspected) {
        throw businessRule(
            "Record the vehicle inspection — damage found, or confirm none — before completing this return.",
        );
    }
}

/**
 * Damage summed from the incidents raised against this rental. Disputed
 * damage is excluded — it is not yet a charge anyone owes. Exported so
 * returns.service.ts's saveInspection/getReturnDetail compute the exact same
 * figure settleReturn will ultimately charge, rather than a number that can
 * drift from it.
 */
export async function damageAmountFor(rentalId: string): Promise<number> {
    const { data: damageRows, error } = await supabaseAdmin
        .from("damages")
        .select("assessed_amount, status, incidents!inner(rental_id)")
        .eq("incidents.rental_id", rentalId)
        .neq("status", "disputed");
    if (error) throw error;
    return Math.round((damageRows ?? []).reduce((sum, d) => sum + Number(d.assessed_amount), 0) * 100) / 100;
}

/**
 * Closes the open return and writes the settlement.
 *
 * Shared by completeRide and moveRideToMaintenance so the two can't drift —
 * otherwise "return it damaged" would be a free late-fee bypass.
 *
 * The settlement row is where the money now lives, and the database checks its
 * arithmetic: `net_amount` must equal the deposit less the charges, and
 * `outcome` must agree with the sign. That is a real gain over the old
 * `days_late`/`late_penalty_amount` columns on the rental, which nothing
 * validated against the deposit at all.
 */
async function settleReturn(
    before: RawRentalRow,
    input: { inspected?: boolean; other_charges_amount?: number },
    actor: AuthContext,
    settledAt: Date,
): Promise<void> {
    const ret = openReturn(before.rental_returns);

    // Critical Validation (Overdue Rider → Return spec): a return with a
    // staged additional-amount-due invoice cannot be approved until that
    // invoice is paid AND an admin has explicitly verified it — the invoice
    // being merely paid is not enough on its own. Enforced here, not just in
    // returns.service.ts, so completeRide can never be used as a side door
    // around the gate.
    if (ret?.additional_due_invoice_id && !ret.payment_verified_at) {
        throw businessRule(
            "The rider's outstanding additional amount must be paid and verified before this return can be approved.",
        );
    }

    // The return-LATENESS fee (the scooter itself coming back late) is
    // deliberately not charged here — the rider-facing renewal late fee
    // (Overdue Rider → Late Fee Payment → Return gate, overdueLateFee.ts) is
    // now the only late fee this system collects; removed per admin request
    // rather than double-charging for lateness two different ways.
    const lateFee = 0;

    if (ret) {
        const { error } = await supabaseAdmin
            .from("rental_returns")
            .update({
                status: "approved",
                approved_at: settledAt.toISOString(),
                approved_by_user_id: actor.id,
                ...(ret.inspected_at || !input.inspected
                    ? {}
                    : { inspected_at: settledAt.toISOString(), inspected_by_user_id: actor.id }),
            })
            .eq("rental_id", before.id)
            .in("status", ["requested", "inspected"]);
        if (error) throw error;
    }

    const damageAmount = await damageAmountFor(before.id);

    // Inspection (returns.service.ts's saveInspection) stages other_charges_amount
    // on the return row itself once it has run; that value wins over whatever
    // completeRide was called with directly, since the review flow is
    // authoritative once it has happened.
    const otherCharges = ret?.other_charges_amount != null
        ? Number(ret.other_charges_amount)
        : input.other_charges_amount ?? 0;

    const deposit = await getDepositForSubscriptionOrNull(before.subscription_id);
    const depositAmount = deposit?.amount ?? 0;
    const totalCharges = Math.round((lateFee + damageAmount + otherCharges) * 100) / 100;
    const netAmount = Math.round((depositAmount - totalCharges) * 100) / 100;

    const { error: settlementError } = await supabaseAdmin.from("rental_settlements").insert({
        rental_id: before.id,
        settled_at: settledAt.toISOString(),
        settled_by_user_id: actor.id,
        deposit_amount_snapshot: depositAmount,
        late_fee_amount: lateFee,
        damage_amount: damageAmount,
        other_charges_amount: otherCharges,
        total_charges_amount: totalCharges,
        net_amount: netAmount,
        outcome: netAmount > 0 ? "refund_due" : netAmount < 0 ? "amount_due" : "balanced",
        // The due invoice was already raised (and, per the gate above, paid
        // and verified) at inspection time — reuse it rather than minting a
        // second one for the same debt.
        invoice_id: netAmount < 0 ? ret?.additional_due_invoice_id ?? null : null,
    });
    if (settlementError && (settlementError as { code?: string }).code !== "23505") {
        throw settlementError;
    }
}

/**
 * Releases the vehicle a rental holds.
 *
 * Closing the assignment is the whole action: the trigger on that table calls
 * `recompute_vehicle_status()`, which is what returns the scooter to the pool.
 * The old code wrote `vehicles.status` directly here, with a comment about the
 * sync trigger silently no-opping if the status had drifted — a problem that
 * cannot arise now, because status is derived rather than asserted.
 */
async function releaseAssignment(rentalId: string, releasedAt: Date): Promise<string | null> {
    const { data, error } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .update({ released_at: releasedAt.toISOString() })
        .eq("rental_id", rentalId)
        .is("released_at", null)
        .select("vehicle_id")
        .maybeSingle();
    if (error) throw error;
    return data?.vehicle_id ?? null;
}

/** Normal ride end. */
export async function completeRide(
    id: string,
    input: CompleteRideInput,
    actor: AuthContext,
): Promise<AdminRentalRow> {
    const before = await requireActiveRental(id);
    await assertInspected(before, input);

    const endedAt = new Date();
    await settleReturn(before, input, actor, endedAt);

    const { error } = await supabaseAdmin
        .from("rentals")
        .update({ status: "completed", returned_at: endedAt.toISOString() })
        .eq("id", id)
        .eq("status", "active");
    if (error) throw error;

    await releaseAssignment(id, endedAt);

    const subscription = unwrap<SubscriptionSlice>(before.subscriptions);

    // Start the deposit's refund-eligibility clock and end the subscription —
    // but only for a GENUINE final return, not the temp-vehicle closure that
    // maintenance used to trigger mid-repair.
    //
    // That check used to be "is this still the booking's active rental?".
    // It is no longer needed at all: a maintenance swap keeps the same rental
    // and just moves its assignment, so completeRide is only ever reached by a
    // real return. The whole active_rental_id dance existed to work around
    // rentals being recreated on every handover.
    if (subscription) {
        await setDepositRefundEligible(subscription.id, endedAt);
        const { error: subError } = await supabaseAdmin
            .from("subscriptions")
            .update({ status: "ended", ended_at: endedAt.toISOString() })
            .eq("id", subscription.id)
            .in("status", ["active", "past_due", "paused"]);
        if (subError) throw subError;
    }

    const rider = unwrap<{ id: string }>(before.users);

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider?.id ?? null,
        action: "rental.completed",
        entityType: "rental",
        entityId: id,
        before: { status: "active" },
        after: { status: "completed" },
    });

    if (rider) {
        await notifyUser(rider.id, {
            template: "rental_completed",
            title: "Ride Completed",
            body: "Thanks for returning your scooter.",
            screen: "booking-history",
        });
    }

    return getRentalById(id);
}

/**
 * Ends the ride like completeRide, but opens a maintenance ticket — for a
 * vehicle returned with a reported issue, not fit to hand to the next rider.
 *
 * The vehicle reaches `maintenance` because the open ticket exists, not
 * because this writes a status. That is the same derivation
 * `recompute_vehicle_status()` applies everywhere else.
 */
export async function moveRideToMaintenance(
    id: string,
    input: MoveToMaintenanceInput,
    actor: AuthContext,
): Promise<AdminRentalRow> {
    const before = await requireActiveRental(id);
    // Same inspection gate as completeRide — a vehicle routed to maintenance
    // still needs its deposit settlement recorded, damage or not.
    await assertInspected(before, input);

    const endedAt = new Date();
    await settleReturn(before, input, actor, endedAt);

    const { error: rentalError } = await supabaseAdmin
        .from("rentals")
        .update({ status: "completed", returned_at: endedAt.toISOString() })
        .eq("id", id)
        .eq("status", "active");
    if (rentalError) throw rentalError;

    const vehicleId = await releaseAssignment(id, endedAt);
    if (!vehicleId) throw businessRule("This rental has no vehicle attached to send for maintenance.");

    const rider = unwrap<{ id: string; full_name: string }>(before.users);
    const subscription = unwrap<SubscriptionSlice>(before.subscriptions);

    const { data: ticket, error: ticketError } = await supabaseAdmin
        .from("maintenance_tickets")
        .insert({
            vehicle_id: vehicleId,
            reported_by_user_id: actor.id,
            description: input.description,
            status: "reported",
        })
        .select("id")
        .single();
    if (ticketError) throw ticketError;

    // Pause the rider's billing — they must not lose days or be charged while
    // the vehicle they were assigned is unavailable.
    if (subscription) {
        await pauseSubscription(subscription.id, ticket.id, actor);
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider?.id ?? null,
        action: "rental.moved_to_maintenance",
        entityType: "rental",
        entityId: id,
        before: { status: "active" },
        after: {
            status: "completed",
            maintenance_ticket_id: ticket.id,
            description: input.description,
        },
    });

    const vehicle = currentVehicle(before.rental_vehicle_assignments);
    await notify({
        notificationType: "maintenance_ticket_created",
        referenceType: "maintenance_ticket",
        referenceId: ticket.id,
        title: "Maintenance Ticket Opened",
        bodyFallback: "{vehicle} was moved to maintenance after a return.",
        screen: "/maintenance",
        riderId: rider?.id,
        vehicleId,
        bookingId: subscription?.booking_id,
        vehicleNameOverride: vehicle ? `${vehicle.name} (${vehicle.registration_number})` : undefined,
        excludeUserId: actor.id,
    });

    return getRentalById(id);
}

/**
 * Admin declines a pending return request. Does NOT settle the rental — it
 * stays `active`, and the rider is free to request a return again.
 *
 * The rejection is now RECORDED rather than erased. The old version nulled the
 * four `return_*` columns back out, which left no trace that a return had been
 * asked for and refused; this marks the row `rejected` with a reason, and a
 * fresh request creates a new row alongside it.
 */
export async function rejectReturn(
    id: string,
    input: RejectReturnInput,
    actor: AuthContext,
): Promise<AdminRentalRow> {
    const before = await requireActiveRental(id);
    const pending = openReturn(before.rental_returns);
    if (!pending) throw conflict("No return request is pending for this rental.");

    const { error } = await supabaseAdmin
        .from("rental_returns")
        .update({
            status: "rejected",
            rejected_at: new Date().toISOString(),
            rejected_by_user_id: actor.id,
            rejection_reason: input.reason,
        })
        .eq("rental_id", id)
        .in("status", ["requested", "inspected"]);
    if (error) throw error;

    const rider = unwrap<{ id: string }>(before.users);

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider?.id ?? null,
        action: "rental.return_rejected",
        entityType: "rental_return",
        entityId: id,
        before: {
            requested_at: pending.requested_at,
            requested_reason: pending.requested_reason,
            due_back_at: pending.due_back_at,
        },
        after: { status: "rejected", reason: input.reason },
    });

    if (rider) {
        await notifyUser(rider.id, {
            template: "rental_return_rejected",
            title: "Return Request Declined",
            body: `Our team couldn't accept your return request: ${input.reason}. Your ride is still active — you can request a return again anytime.`,
            screen: "post-booking-dashboard",
        });
    }

    return getRentalById(id);
}
