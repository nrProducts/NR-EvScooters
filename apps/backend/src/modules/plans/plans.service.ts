import { supabaseAdmin } from "../../config/supabase";
import { conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { addDays, wholeDaysBetween } from "../../common/dates";
import { notifyUser } from "../notifications/notifications.service";
import { AuthContext, Paginated } from "../../types";
import { CreatePlanInput, ListPlansFilters, PlanResumeReason, PlanRow, UpdatePlanInput } from "./plans.types";

const PLAN_COLUMNS = `
    id, name, billing_cycle, price, included_minutes, duration_days, deposit_amount,
    vehicle_model_id, active, created_at, updated_at
`;

interface RawPlanRow {
    id: string;
    name: string;
    billing_cycle: PlanRow["billing_cycle"];
    price: number | string;
    included_minutes: number | string | null;
    duration_days: number;
    deposit_amount: number | string;
    vehicle_model_id: string | null;
    active: boolean;
    created_at: string;
    updated_at: string | null;
}

function toPlanRow(row: RawPlanRow): PlanRow {
    return {
        ...row,
        price: Number(row.price),
        deposit_amount: Number(row.deposit_amount),
        included_minutes: row.included_minutes === null ? null : Number(row.included_minutes),
    };
}

// ---------------------------------------------------------------------------
// Admin CRUD — plans were previously seed-only; do not hardcode price/
// duration/deposit per the spec, hence this module.
// ---------------------------------------------------------------------------

/**
 * Every active vehicle model, for the plan editor's model picker.
 * Deliberately NOT vehicle-catalog's listVehicleModels() — that endpoint is
 * rider-browse-only and filters to models that already have an active plan
 * (plans.active=true), which makes it impossible to ever create a model's
 * FIRST plan through the admin UI. This has no such filter.
 */
export async function listVehicleModelOptions(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_models")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
    if (error) throw error;
    return (data ?? []) as { id: string; name: string }[];
}

export async function listPlans(filters: ListPlansFilters): Promise<Paginated<PlanRow>> {
    let query = supabaseAdmin.from("plans").select(PLAN_COLUMNS, { count: "exact" });
    if (filters.vehicleModelId) query = query.eq("vehicle_model_id", filters.vehicleModelId);
    if (filters.active !== undefined) query = query.eq("active", filters.active);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;
    return paginate(((data ?? []) as unknown as RawPlanRow[]).map(toPlanRow), count ?? 0, filters);
}

export async function getPlanById(id: string): Promise<PlanRow> {
    const { data, error } = await supabaseAdmin.from("plans").select(PLAN_COLUMNS).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Plan not found.");
    return toPlanRow(data as unknown as RawPlanRow);
}

export async function createPlan(input: CreatePlanInput, actor: AuthContext): Promise<PlanRow> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .insert({
            name: input.name,
            billing_cycle: input.billing_cycle,
            price: input.price,
            duration_days: input.duration_days,
            deposit_amount: input.deposit_amount,
            vehicle_model_id: input.vehicle_model_id,
            included_minutes: input.included_minutes ?? null,
            active: input.active ?? true,
        })
        .select(PLAN_COLUMNS)
        .single();
    if (error) {
        if (error.code === "23505") throw conflict("A plan with this name already exists.", { name: "This name is already in use." });
        throw error;
    }
    const plan = toPlanRow(data as unknown as RawPlanRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "plan.updated",
        entityType: "plan", entityId: plan.id,
        after: { name: plan.name, price: plan.price, duration_days: plan.duration_days, deposit_amount: plan.deposit_amount },
    });

    return plan;
}

export async function updatePlan(id: string, patch: UpdatePlanInput, actor: AuthContext): Promise<PlanRow> {
    const { data, error } = await supabaseAdmin
        .from("plans")
        .update(patch)
        .eq("id", id)
        .select(PLAN_COLUMNS)
        .maybeSingle();
    if (error) {
        if (error.code === "23505") throw conflict("A plan with this name already exists.", { name: "This name is already in use." });
        throw error;
    }
    if (!data) throw notFound("Plan not found.");
    const plan = toPlanRow(data as unknown as RawPlanRow);

    await writeAudit({
        actorId: actor.id, targetUserId: null, action: "plan.updated",
        entityType: "plan", entityId: plan.id, after: patch,
    });

    return plan;
}

// ---------------------------------------------------------------------------
// Recurring-billing pause/resume engine. Anchored on bookings, not rentals —
// a maintenance episode ends the live rentals row and each handover (temp
// vehicle / handback / permanent replacement) inserts a NEW, otherwise-
// disconnected rentals row, so bookings is the one row stable for the whole
// life of the plan. See 20260810100300_booking_plan_billing.sql.
// ---------------------------------------------------------------------------

export interface ResumeComputation {
    daysPaused: number;
    restoredStatus: "active" | "due";
    newNextDueAt: string;
}

/**
 * Pure day-shift math, exported for the same reason
 * computeCancellationCharge/computeLateReturnPenalty are: tests exercise
 * this exact rule. `pausedAt`/`resumedAt` decide BOTH how many days to add
 * back AND whether the restored plan_status is 'active' or 'due' — the
 * latter is recoverable from whether next_due_at had already passed at the
 * moment the pause began, not "now".
 */
export function computePlanResume(input: {
    nextDueAt: string;
    pausedAt: Date;
    resumedAt?: Date;
}): ResumeComputation {
    const resumedAt = input.resumedAt ?? new Date();
    const daysPaused = Math.max(0, wholeDaysBetween(input.pausedAt, resumedAt));
    const newNextDueAt = addDays(input.nextDueAt, daysPaused);
    const wasDueAtPauseTime = new Date(`${input.nextDueAt}T00:00:00Z`) <= input.pausedAt;
    return { daysPaused, restoredStatus: wasDueAtPauseTime ? "due" : "active", newNextDueAt };
}

/**
 * Fires when a booking's active vehicle enters maintenance (called from
 * rentals.service.ts's moveRideToMaintenance). Freezes next_due_at/
 * current_period_start in place — resumePlanForBooking shifts them forward
 * by exactly the elapsed pause duration, never a blanket re-anchor to "now".
 * A no-op for a vehicle with no attached booking (e.g. a spare/demo unit) or
 * a booking whose plan isn't active yet.
 */
export async function pausePlanForBooking(
    bookingId: string,
    maintenanceTicketId: string,
    actor: AuthContext | null,
): Promise<void> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, plan_status, next_due_at")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!booking || !booking.plan_status || booking.plan_status === "paused" || !booking.next_due_at) return;

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({ plan_status: "paused", plan_paused_at: now })
        .eq("id", bookingId)
        .in("plan_status", ["active", "due"])
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // Already paused by a concurrent call — idempotent no-op.

    const { error: eventError } = await supabaseAdmin.from("plan_pause_events").insert({
        booking_id: bookingId,
        maintenance_ticket_id: maintenanceTicketId,
        paused_at: now,
        old_next_due_at: booking.next_due_at,
    });
    if (eventError) throw eventError;

    await writeAudit({
        actorId: actor?.id ?? null, targetUserId: booking.user_id, action: "plan.paused",
        entityType: "booking", entityId: bookingId, after: { plan_status: "paused" },
    });

    await notifyUser(booking.user_id, {
        template: "maintenance_plan_paused",
        title: "Rental Plan Paused",
        body: "Your vehicle is currently under maintenance. Your rental plan has been paused.",
        screen: "my-plan",
    });
}

/**
 * The one shared resume function, called from exactly the three "rider is
 * riding again" hooks: assignTempVehicle, updateMaintenanceTicket's handback
 * branch, and reassignAfterScrap (maintenance.service.ts). Never creates a
 * new plan or charges the rider again — it restores the SAME plan.
 */
export async function resumePlanForBooking(
    bookingId: string,
    maintenanceTicketId: string,
    resumedVia: PlanResumeReason,
    newRentalId: string,
    actor: AuthContext,
): Promise<void> {
    const { data: booking, error } = await supabaseAdmin
        .from("bookings")
        .select("id, user_id, plan_status, plan_paused_at, next_due_at, plan_paused_days_total")
        .eq("id", bookingId)
        .maybeSingle();
    if (error) throw error;
    if (!booking || booking.plan_status !== "paused" || !booking.plan_paused_at || !booking.next_due_at) return;

    const { data: openEvent, error: eventFetchError } = await supabaseAdmin
        .from("plan_pause_events")
        .select("id, paused_at")
        .eq("booking_id", bookingId)
        .is("resumed_at", null)
        .maybeSingle();
    if (eventFetchError) throw eventFetchError;

    const pausedAt = new Date(openEvent?.paused_at ?? booking.plan_paused_at);
    const resumedAt = new Date();
    const { daysPaused, restoredStatus, newNextDueAt } = computePlanResume({
        nextDueAt: booking.next_due_at, pausedAt, resumedAt,
    });

    const { data: updated, error: updateError } = await supabaseAdmin
        .from("bookings")
        .update({
            plan_status: restoredStatus,
            next_due_at: newNextDueAt,
            plan_paused_at: null,
            plan_paused_days_total: (booking.plan_paused_days_total ?? 0) + daysPaused,
            active_rental_id: newRentalId,
        })
        .eq("id", bookingId)
        .eq("plan_status", "paused")
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return; // Already resumed by a concurrent call — idempotent no-op.

    if (openEvent) {
        await supabaseAdmin
            .from("plan_pause_events")
            .update({
                resumed_at: resumedAt.toISOString(),
                days_paused: daysPaused,
                resumed_via: resumedVia,
                new_next_due_at: newNextDueAt,
            })
            .eq("id", openEvent.id);
    }

    await writeAudit({
        actorId: actor.id, targetUserId: booking.user_id, action: "plan.resumed",
        entityType: "booking", entityId: bookingId,
        after: {
            plan_status: restoredStatus, next_due_at: newNextDueAt, days_paused: daysPaused,
            resumed_via: resumedVia, maintenance_ticket_id: maintenanceTicketId,
        },
    });

    await notifyUser(booking.user_id, {
        template: "vehicle_available_again",
        title: "Vehicle Available Again",
        body: "Your vehicle has been assigned back to you and your rental plan has resumed.",
        screen: "my-plan",
    });
}
