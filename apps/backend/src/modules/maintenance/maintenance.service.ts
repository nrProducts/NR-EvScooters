import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyAdmins, notifyUser } from "../notifications/notifications.service";
import { assignVehicleToUser, scrapVehicle } from "../vehicles/vehicles.service";
import { completeRide } from "../rentals/rentals.service";
import { resumePlanForBooking } from "../plans/plans.service";
import { AuthContext, Paginated } from "../../types";
import {
    AdminMaintenanceRow, AssignTempVehicleInput, CreateMaintenanceInput, ListMaintenanceFilters,
    MaintenanceNoticeStage, MaintenanceNoticeView, MaintenanceOutcome, MaintenanceStatus, MaintenanceView,
    MyMaintenanceHistoryFilters, NotRepairableInput, QuickFixInput, ReassignAfterScrapInput,
    UpdateMaintenanceInput,
} from "./maintenance.types";

/**
 * ⚠️ Every field on MaintenanceView/AdminMaintenanceRow must appear in these
 * select strings. The select is an untyped template string and the result is
 * double-cast, so a field added to the interface but omitted here compiles
 * clean and silently returns undefined. The table now has 3 FKs to `vehicles`
 * and 3 to `users`, so every embed needs a `!fk_column` disambiguation hint or
 * PostgREST 300s on ambiguity.
 */
const MAINTENANCE_COLUMNS = `
    id, status, description, resolved_at, created_at, outcome, expected_ready_at, triaged_at,
    vehicle:vehicles!vehicle_id(id, name, registration_number),
    displaced_rider:users!displaced_rider_id(id, full_name),
    temp_vehicle:vehicles!temp_vehicle_id(id, name, registration_number, battery_percentage),
    replacement_vehicle:vehicles!replacement_vehicle_id(id, name, registration_number)
`;

const ADMIN_MAINTENANCE_COLUMNS = `
    ${MAINTENANCE_COLUMNS},
    reported_by:users!reported_by(id, full_name),
    triaged_by_user:users!triaged_by(id, full_name)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawMaintenanceRow {
    id: string;
    status: MaintenanceView["status"];
    description: string;
    resolved_at: string | null;
    created_at: string;
    outcome: MaintenanceOutcome | null;
    expected_ready_at: string | null;
    triaged_at: string | null;
    vehicle: unknown;
    displaced_rider: unknown;
    temp_vehicle: unknown;
    replacement_vehicle: unknown;
}

interface RawAdminMaintenanceRow extends RawMaintenanceRow {
    reported_by: unknown;
    triaged_by_user: unknown;
}

function toMaintenanceView(row: RawMaintenanceRow): MaintenanceView {
    return {
        id: row.id,
        status: row.status,
        description: row.description,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        outcome: row.outcome,
        expected_ready_at: row.expected_ready_at,
        triaged_at: row.triaged_at,
        vehicle: unwrap(row.vehicle),
        displaced_rider: unwrap(row.displaced_rider),
        temp_vehicle: unwrap(row.temp_vehicle),
        replacement_vehicle: unwrap(row.replacement_vehicle),
    };
}

function toAdminMaintenanceRow(row: RawAdminMaintenanceRow): AdminMaintenanceRow {
    return {
        ...toMaintenanceView(row),
        reported_by: unwrap(row.reported_by),
        triaged_by: unwrap(row.triaged_by_user),
    };
}

export interface RiderRental {
    vehicle_id: string;
    started_at: string;
}

/**
 * Turns the rider's rentals into the PostgREST `or=` filter that decides which
 * maintenance tickets they may see: per vehicle, only tickets raised at or
 * after their FIRST pickup of that unit.
 *
 * This is the whole access check for /me/history — the query runs as
 * supabaseAdmin, so the vehicle_maintenance_admin_only RLS policy is bypassed
 * and nothing else stands between a rider and other people's incident reports.
 *
 * Returns null when the rider has rented nothing, which callers must treat as
 * "no results" rather than "no filter" — an empty or= string would match every
 * row in the table.
 *
 * Exported for tests, same reason computeCancellationCharge is.
 */
export function buildOwnershipScope(rentals: RiderRental[]): string | null {
    // Earliest pickup per vehicle — a rider who rented the same unit twice
    // sees from the first time they had it.
    const since = new Map<string, string>();
    for (const r of rentals) {
        const current = since.get(r.vehicle_id);
        if (!current || r.started_at < current) since.set(r.vehicle_id, r.started_at);
    }
    if (since.size === 0) return null;

    return [...since.entries()]
        .map(([vehicleId, startedAt]) => `and(vehicle_id.eq.${vehicleId},created_at.gte.${startedAt})`)
        .join(",");
}

/**
 * Maintenance events for vehicles this rider has personally rented. There's no
 * direct rider<->maintenance link in the schema (vehicle_maintenance is
 * reported by staff, not the rider), so ownership is derived from the rider's
 * own rental history.
 *
 * SCOPED PER VEHICLE TO THE RIDER'S PICKUP DATE. `description` is staff-authored
 * free text about a specific incident, so returning every ticket on a vehicle
 * the rider once had would show them another rider's damage report. Each
 * vehicle therefore contributes only tickets raised at or after the rider's
 * FIRST pickup of that unit.
 *
 * Deliberately a lower bound only, with no ceiling at ended_at:
 * moveRideToMaintenance ends the rental AND opens the ticket in one flow, so an
 * upper bound would race that write and hide the ticket for damage the rider
 * themselves just reported.
 */
export async function getMyMaintenanceHistory(
    userId: string,
    filters: MyMaintenanceHistoryFilters,
): Promise<Paginated<MaintenanceView>> {
    let rentalsQuery = supabaseAdmin
        .from("rentals")
        .select("vehicle_id, started_at")
        .eq("user_id", userId);

    if (filters.vehicleId) rentalsQuery = rentalsQuery.eq("vehicle_id", filters.vehicleId);

    const { data: rentals, error: rentalsError } = await rentalsQuery;
    if (rentalsError) throw rentalsError;

    const ownershipFilter = buildOwnershipScope((rentals ?? []) as RiderRental[]);
    if (!ownershipFilter) return paginate([], 0, filters);

    const [from, to] = toRange(filters);
    let query = supabaseAdmin
        .from("vehicle_maintenance")
        .select(MAINTENANCE_COLUMNS, { count: "exact" })
        .or(ownershipFilter);

    if (filters.status) query = query.eq("status", filters.status);

    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawMaintenanceRow[]).map(toMaintenanceView);
    return paginate(items, count ?? 0, filters);
}

/**
 * What the rider's home screen renders — the newest open ticket where THEY
 * were the one displaced, if any. Disappears the instant the ticket resolves
 * (any outcome), so this never surfaces raw historical assignment data.
 */
export async function getMyMaintenanceNotice(userId: string): Promise<MaintenanceNoticeView | null> {
    interface RawNoticeRow {
        id: string;
        outcome: MaintenanceOutcome | null;
        expected_ready_at: string | null;
        temp_vehicle: unknown;
    }

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select("id, outcome, expected_ready_at, temp_vehicle:vehicles!temp_vehicle_id(id, name, registration_number, battery_percentage)")
        .eq("displaced_rider_id", userId)
        .in("status", ["reported", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as RawNoticeRow;
    const stage: MaintenanceNoticeStage =
        row.outcome === "quick_fix" ? "quick_fix"
            : row.outcome === "standard_temp" ? "temp_vehicle"
                : "pending_triage";

    return {
        ticket_id: row.id,
        stage,
        expected_ready_at: row.expected_ready_at,
        temp_vehicle: unwrap(row.temp_vehicle),
    };
}

// ---------------------------------------------------------------------------
// Admin/staff — across the whole fleet
// ---------------------------------------------------------------------------

export async function listMaintenance(filters: ListMaintenanceFilters): Promise<Paginated<AdminMaintenanceRow>> {
    let query = supabaseAdmin.from("vehicle_maintenance").select(ADMIN_MAINTENANCE_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    return paginate(
        ((data ?? []) as unknown as RawAdminMaintenanceRow[]).map(toAdminMaintenanceRow),
        count ?? 0,
        filters,
    );
}

export async function createMaintenanceTicket(
    input: CreateMaintenanceInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id")
        .eq("id", input.vehicle_id)
        .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .insert({
            vehicle_id: input.vehicle_id,
            reported_by: actor.id,
            description: input.description,
            status: input.status ?? "reported",
        })
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();

    if (error) throw error;
    const ticket = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.created",
        entityType: "vehicle_maintenance",
        entityId: ticket.id,
        after: { vehicle_id: input.vehicle_id, status: ticket.status },
    });

    await notifyAdmins(
        {
            template: "maintenance_review_needed",
            title: "Maintenance Ticket Reported",
            body: ticket.vehicle
                ? `${ticket.vehicle.name} (${ticket.vehicle.registration_number}) needs triage: ${input.description}`
                : `A vehicle needs triage: ${input.description}`,
            screen: "maintenance",
        },
        actor.id,
    );

    return ticket;
}

interface RawTicketState {
    id: string;
    vehicle_id: string;
    status: MaintenanceStatus;
    outcome: MaintenanceOutcome | null;
    displaced_rider_id: string | null;
    temp_vehicle_id: string | null;
    replacement_vehicle_id: string | null;
    booking_id: string | null;
}

/** Lightweight internal read used by the triage/resolve actions to check guards before writing. */
async function requireTicketState(id: string): Promise<RawTicketState> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select("id, vehicle_id, status, outcome, displaced_rider_id, temp_vehicle_id, replacement_vehicle_id, booking_id")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");
    return data as unknown as RawTicketState;
}

function assertOpenAndUntriaged(ticket: RawTicketState): void {
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
        throw businessRule("This ticket is already closed.");
    }
    if (ticket.outcome) throw businessRule("This ticket has already been triaged.");
}

/** Admin verifies the vehicle can be fixed same-day — no temp vehicle needed. */
export async function triageQuickFix(
    id: string,
    input: QuickFixInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    assertOpenAndUntriaged(ticket);

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update({
            outcome: "quick_fix",
            expected_ready_at: input.expected_ready_at,
            status: ticket.status === "reported" ? "in_progress" : ticket.status,
            triaged_by: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();
    if (error) throw error;
    const updated = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    if (ticket.displaced_rider_id) {
        await notifyUser(ticket.displaced_rider_id, {
            template: "maintenance_quick_fix",
            title: "Your Scooter Is Being Repaired",
            body: `Expected ready by ${new Date(input.expected_ready_at).toLocaleString()}.`,
            screen: "home",
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: ticket.displaced_rider_id,
        action: "maintenance.outcome_set",
        entityType: "vehicle_maintenance",
        entityId: id,
        after: { outcome: "quick_fix", expected_ready_at: input.expected_ready_at },
    });

    return updated;
}

/**
 * Admin verifies the vehicle needs longer repair — hands the displaced rider
 * a temp vehicle so they aren't blocked. Reuses assignVehicleToUser as-is
 * (KYC-verified guard included) so this is the exact same handover mechanism
 * as a direct admin assignment, just with the ticket stamped alongside it.
 */
export async function assignTempVehicle(
    id: string,
    input: AssignTempVehicleInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    assertOpenAndUntriaged(ticket);
    if (!ticket.displaced_rider_id) {
        throw businessRule("No displaced rider recorded for this ticket — cannot issue a temp vehicle.");
    }
    if (input.temp_vehicle_id === ticket.vehicle_id) {
        throw businessRule("Pick a different vehicle to use as the temporary unit.");
    }

    const { rentalId } = await assignVehicleToUser(
        input.temp_vehicle_id, ticket.displaced_rider_id, actor, ticket.booking_id ?? undefined,
    );

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update({
            outcome: "standard_temp",
            temp_vehicle_id: input.temp_vehicle_id,
            status: ticket.status === "reported" ? "in_progress" : ticket.status,
            triaged_by: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();
    if (error) throw error;
    const updated = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    // The rider's existing weekly-billing plan continues on the temp
    // vehicle — never restarted or re-charged just because the vehicle changed.
    if (ticket.booking_id) {
        await resumePlanForBooking(ticket.booking_id, id, "temp_vehicle", rentalId, actor);
    }

    await notifyUser(ticket.displaced_rider_id, {
        template: "maintenance_temp_vehicle",
        title: "Temporary Vehicle Assigned",
        body: "Your scooter is being repaired — use this temporary vehicle until it's ready.",
        screen: "home",
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: ticket.displaced_rider_id,
        action: "maintenance.outcome_set",
        entityType: "vehicle_maintenance",
        entityId: id,
        after: { outcome: "standard_temp", temp_vehicle_id: input.temp_vehicle_id },
    });

    return updated;
}

/**
 * Admin verifies the vehicle can't be fixed — scraps it (reusing the
 * existing, unmodified scrapVehicle) and closes the ticket immediately.
 * Reassigning the displaced rider to a replacement vehicle is a deliberately
 * separate, retryable step (reassignAfterScrap) so a rider-account failure
 * there can't leave this half-done.
 */
export async function resolveNotRepairable(
    id: string,
    input: NotRepairableInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    assertOpenAndUntriaged(ticket);

    await scrapVehicle(ticket.vehicle_id, input, actor);

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update({
            outcome: "not_repairable",
            status: "resolved",
            resolved_at: new Date().toISOString(),
            triaged_by: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();
    if (error) throw error;
    const updated = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: ticket.displaced_rider_id,
        action: "maintenance.outcome_set",
        entityType: "vehicle_maintenance",
        entityId: id,
        after: { outcome: "not_repairable" },
    });

    return updated;
}

/**
 * One-way follow-up to resolveNotRepairable: permanently hands the displaced
 * rider a new vehicle. Idempotent on replacement_vehicle_id so a retry after
 * a failed attempt (e.g. the rider's KYC had lapsed) can't double-assign.
 */
export async function reassignAfterScrap(
    id: string,
    input: ReassignAfterScrapInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    if (ticket.outcome !== "not_repairable") {
        throw businessRule("This ticket wasn't marked not-repairable.");
    }
    if (ticket.replacement_vehicle_id) {
        throw businessRule("A replacement vehicle has already been assigned for this ticket.");
    }
    if (!ticket.displaced_rider_id) {
        throw businessRule("No displaced rider recorded for this ticket — nothing to reassign.");
    }

    const { rentalId } = await assignVehicleToUser(
        input.replacement_vehicle_id, ticket.displaced_rider_id, actor, ticket.booking_id ?? undefined,
    );

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update({ replacement_vehicle_id: input.replacement_vehicle_id })
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .single();
    if (error) throw error;
    const updated = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    // The rider's existing plan continues on the replacement vehicle — the
    // old one was scrapped, but this is not a new booking or a new charge.
    if (ticket.booking_id) {
        await resumePlanForBooking(ticket.booking_id, id, "replacement", rentalId, actor);
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: ticket.displaced_rider_id,
        action: "maintenance.outcome_set",
        entityType: "vehicle_maintenance",
        entityId: id,
        after: { replacement_vehicle_id: input.replacement_vehicle_id },
    });

    return updated;
}

export async function updateMaintenanceTicket(
    id: string,
    patch: UpdateMaintenanceInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    if (patch.status === "resolved") {
        const ticket = await requireTicketState(id);

        if (ticket.status !== "resolved" && ticket.status !== "cancelled") {
            if (ticket.outcome && ticket.displaced_rider_id) {
                // Release from maintenance first (respecting any OTHER still-open
                // ticket on this vehicle), then hand it back to the same rider —
                // assignVehicleToUser requires status='available', so this order
                // is load-bearing.
                await releaseVehicleIfNoOpenTickets(ticket.vehicle_id, id);
                const { rentalId } = await assignVehicleToUser(
                    ticket.vehicle_id, ticket.displaced_rider_id, actor, ticket.booking_id ?? undefined,
                );

                // The rider's plan resumes on their own original vehicle,
                // remaining duration intact.
                if (ticket.booking_id) {
                    await resumePlanForBooking(ticket.booking_id, id, "original_handback", rentalId, actor);
                }

                if (ticket.outcome === "standard_temp" && ticket.temp_vehicle_id) {
                    const { data: tempRental, error: tempRentalError } = await supabaseAdmin
                        .from("rentals")
                        .select("id")
                        .eq("vehicle_id", ticket.temp_vehicle_id)
                        .eq("status", "active")
                        .maybeSingle();
                    if (tempRentalError) throw tempRentalError;
                    if (tempRental) await completeRide(tempRental.id, {}, actor);
                }

                await notifyUser(ticket.displaced_rider_id, {
                    template: "maintenance_vehicle_returned",
                    title: "Your Scooter Is Ready",
                    body: ticket.outcome === "standard_temp"
                        ? "Your original scooter is back and ready. The temporary vehicle has been released."
                        : "Your scooter has been repaired and is ready to ride.",
                    screen: "home",
                });
            } else {
                // Untriaged ticket — identical to the original, simpler behavior.
                await releaseVehicleIfNoOpenTickets(ticket.vehicle_id, id);
            }
        }
    }

    const next: Record<string, unknown> = { ...patch };
    // resolved_at is server-derived from the status transition, never client-supplied.
    if (patch.status) next.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .update(next)
        .eq("id", id)
        .select(ADMIN_MAINTENANCE_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");
    const ticket = toAdminMaintenanceRow(data as unknown as RawAdminMaintenanceRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.updated",
        entityType: "vehicle_maintenance",
        entityId: ticket.id,
        before: null,
        after: next,
    });

    return ticket;
}

/**
 * Resolving one ticket shouldn't free a vehicle that still has another open
 * issue — only flip it back to 'available' once nothing else is outstanding.
 * `excludeTicketId` leaves the ticket currently being resolved out of that
 * count — it's still 'reported'/'in_progress' in the DB at the moment this
 * runs (the status write happens after any vehicle-side effects, so a
 * mid-flight failure leaves the ticket safely retryable), so without the
 * exclusion this would always see itself as "still open" and never release.
 * The status guard on the vehicles update also protects against clobbering a
 * vehicle that's moved on (e.g. re-assigned) since entering maintenance.
 */
async function releaseVehicleIfNoOpenTickets(vehicleId: string, excludeTicketId?: string): Promise<void> {
    let query = supabaseAdmin
        .from("vehicle_maintenance")
        .select("id", { count: "exact", head: true })
        .eq("vehicle_id", vehicleId)
        .in("status", ["reported", "in_progress"]);
    if (excludeTicketId) query = query.neq("id", excludeTicketId);

    const { count, error: openError } = await query;
    if (openError) throw openError;
    if ((count ?? 0) > 0) return;

    const { error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "available" })
        .eq("id", vehicleId)
        .eq("status", "maintenance");
    if (vehicleError) throw vehicleError;
}
