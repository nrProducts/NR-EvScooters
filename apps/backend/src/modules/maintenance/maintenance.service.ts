import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { scrapVehicle } from "../vehicles/vehicles.service";
import { resumeSubscription } from "../subscriptions/subscriptions.service";
import { AuthContext, Paginated } from "../../types";
import {
    AdminMaintenanceRow, AssignTempVehicleInput, CreateMaintenanceInput, ListMaintenanceFilters,
    MaintenanceNoticeStage, MaintenanceNoticeView, MaintenanceOutcome, MaintenanceStatus, MaintenanceView,
    MyMaintenanceHistoryFilters, NotRepairableInput, QuickFixInput, ReassignAfterScrapInput,
    UpdateMaintenanceInput,
} from "./maintenance.types";

/**
 * Maintenance — `maintenance_tickets`, formerly `vehicle_maintenance`.
 *
 * Four columns went, and between them they change how this module works
 * rather than just what it types:
 *
 *   `temp_vehicle_id` / `replacement_vehicle_id` — a handover is a
 *   `rental_vehicle_assignments` row now, stamped with the ticket that caused
 *   it and a `reason` of `temp_swap` or `replacement`. One ticket can produce
 *   both in sequence, which two nullable columns could not express.
 *
 *   `displaced_rider_id` — derived, not stored. The rider is whoever the
 *   ticket's assignments belong to, or (before triage) whoever currently holds
 *   the vehicle. Storing it was a denormalisation that could disagree with the
 *   rental it was copied from.
 *
 *   `booking_id` — a ticket is about a vehicle. The commercial agreement
 *   affected is reached through the rental holding it, which is also the only
 *   way that stays correct once the rider is on a temp vehicle.
 *
 * **A swap keeps the same rental.** The old code called `assignVehicleToUser`
 * for every handover, opening a *new* `rentals` row each time; the comment on
 * plans.service.ts even explained that plan state had to live on `bookings`
 * because each handover produced "a NEW, otherwise-disconnected rentals row".
 * That workaround is unnecessary now: a rental keeps its identity and changes
 * its assignment, which is exactly what `rental_vehicle_assignments` is for.
 */

const MAINTENANCE_COLUMNS = `
    id, status, description, resolved_at, created_at, outcome, expected_ready_at, triaged_at,
    vehicle:vehicles!vehicle_id(id, display_name, registration_number, vehicle_models(name))
`;

const ADMIN_MAINTENANCE_COLUMNS = `
    ${MAINTENANCE_COLUMNS},
    reported_by:users!reported_by_user_id(id, full_name),
    triaged_by_user:users!triaged_by_user_id(id, full_name)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawVehicleRef {
    id: string;
    display_name: string | null;
    registration_number: string;
    vehicle_models?: unknown;
}

/** `vehicles.name` is `display_name`, falling back to the model's name. */
function toVehicleRef(raw: unknown): { id: string; name: string; registration_number: string } | null {
    const v = unwrap<RawVehicleRef>(raw);
    if (!v) return null;
    const modelName = unwrap<{ name: string }>(v.vehicle_models)?.name ?? "";
    return {
        id: v.id,
        name: v.display_name ?? modelName,
        registration_number: v.registration_number,
    };
}

interface RawMaintenanceRow {
    id: string;
    status: MaintenanceStatus;
    description: string;
    resolved_at: string | null;
    created_at: string;
    outcome: MaintenanceOutcome | null;
    expected_ready_at: string | null;
    triaged_at: string | null;
    vehicle: unknown;
}

interface RawAdminMaintenanceRow extends RawMaintenanceRow {
    reported_by: unknown;
    triaged_by_user: unknown;
}

/**
 * The rider, temp vehicle and replacement vehicle for a set of tickets.
 *
 * One query for the whole page rather than per row. Everything here used to be
 * a column on the ticket; it is all reconstructed from the assignments the
 * ticket caused, plus the assignment currently open on its vehicle for a
 * ticket that has not been triaged yet.
 */
interface TicketDerived {
    displaced_rider: { id: string; full_name: string } | null;
    temp_vehicle: { id: string; name: string; registration_number: string } | null;
    replacement_vehicle: { id: string; name: string; registration_number: string } | null;
    rental_id: string | null;
    subscription_id: string | null;
}

const EMPTY_DERIVED: TicketDerived = {
    displaced_rider: null, temp_vehicle: null, replacement_vehicle: null,
    rental_id: null, subscription_id: null,
};

async function deriveForTickets(
    tickets: Array<{ id: string; vehicle_id: string }>,
): Promise<Map<string, TicketDerived>> {
    const result = new Map<string, TicketDerived>();
    if (tickets.length === 0) return result;

    const ASSIGNMENT_SELECT = `
        maintenance_ticket_id, reason, vehicle_id, assigned_at,
        vehicles(id, display_name, registration_number, vehicle_models(name)),
        rentals(id, subscription_id, users(id, full_name))
    `;

    const [causedRes, currentRes] = await Promise.all([
        // Assignments this ticket produced — the temp and/or replacement.
        supabaseAdmin
            .from("rental_vehicle_assignments")
            .select(ASSIGNMENT_SELECT)
            .in("maintenance_ticket_id", tickets.map((t) => t.id))
            .order("assigned_at", { ascending: false }),
        // Whoever holds the ticket's vehicle right now — the answer for a
        // ticket raised but not yet acted on.
        supabaseAdmin
            .from("rental_vehicle_assignments")
            .select(ASSIGNMENT_SELECT)
            .in("vehicle_id", tickets.map((t) => t.vehicle_id))
            .is("released_at", null),
    ]);
    if (causedRes.error) throw causedRes.error;
    if (currentRes.error) throw currentRes.error;

    type Row = {
        maintenance_ticket_id: string | null;
        reason: string;
        vehicle_id: string;
        vehicles: unknown;
        rentals: unknown;
    };

    const riderOfCurrentHold = new Map<string, { rider: { id: string; full_name: string } | null; rentalId: string | null; subscriptionId: string | null }>();
    for (const row of (currentRes.data ?? []) as unknown as Row[]) {
        const rental = unwrap<{ id: string; subscription_id: string; users: unknown }>(row.rentals);
        riderOfCurrentHold.set(row.vehicle_id, {
            rider: unwrap<{ id: string; full_name: string }>(rental?.users),
            rentalId: rental?.id ?? null,
            subscriptionId: rental?.subscription_id ?? null,
        });
    }

    for (const ticket of tickets) {
        const caused = ((causedRes.data ?? []) as unknown as Row[]).filter(
            (r) => r.maintenance_ticket_id === ticket.id,
        );

        const temp = caused.find((r) => r.reason === "temp_swap");
        const replacement = caused.find((r) => r.reason === "replacement");

        // Prefer the rider named by an assignment this ticket caused: once a
        // temp vehicle is issued, nobody holds the original any more.
        const fromCaused = caused[0]
            ? unwrap<{ id: string; subscription_id: string; users: unknown }>(caused[0].rentals)
            : null;
        const fromHold = riderOfCurrentHold.get(ticket.vehicle_id);

        result.set(ticket.id, {
            displaced_rider:
                (fromCaused ? unwrap<{ id: string; full_name: string }>(fromCaused.users) : null)
                ?? fromHold?.rider
                ?? null,
            temp_vehicle: temp ? toVehicleRef(temp.vehicles) : null,
            replacement_vehicle: replacement ? toVehicleRef(replacement.vehicles) : null,
            rental_id: fromCaused?.id ?? fromHold?.rentalId ?? null,
            subscription_id: fromCaused?.subscription_id ?? fromHold?.subscriptionId ?? null,
        });
    }

    return result;
}

function toMaintenanceView(row: RawMaintenanceRow, derived: TicketDerived): MaintenanceView {
    return {
        id: row.id,
        status: row.status,
        description: row.description,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        outcome: row.outcome,
        expected_ready_at: row.expected_ready_at,
        triaged_at: row.triaged_at,
        vehicle: toVehicleRef(row.vehicle),
        displaced_rider: derived.displaced_rider,
        temp_vehicle: derived.temp_vehicle,
        replacement_vehicle: derived.replacement_vehicle,
    };
}

function toAdminMaintenanceRow(
    row: RawAdminMaintenanceRow,
    derived: TicketDerived,
): AdminMaintenanceRow {
    return {
        ...toMaintenanceView(row, derived),
        reported_by: unwrap(row.reported_by),
        triaged_by: unwrap(row.triaged_by_user),
    };
}

/** Re-reads one ticket in full, for the shape every write returns. */
async function readAdminRow(id: string): Promise<AdminMaintenanceRow> {
    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .select(`${ADMIN_MAINTENANCE_COLUMNS}, vehicle_id`)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");

    const row = data as unknown as RawAdminMaintenanceRow & { vehicle_id: string };
    const derived = await deriveForTickets([{ id: row.id, vehicle_id: row.vehicle_id }]);
    return toAdminMaintenanceRow(row, derived.get(row.id) ?? EMPTY_DERIVED);
}

export interface RiderRental {
    vehicle_id: string;
    started_at: string;
}

/**
 * Turns the rider's vehicle assignments into the PostgREST `or=` filter that
 * decides which maintenance tickets they may see: per vehicle, only tickets
 * raised at or after their FIRST assignment of that unit.
 *
 * This is the whole access check for /me/history — the query runs as
 * supabaseAdmin, so RLS is bypassed and nothing else stands between a rider
 * and other people's incident reports.
 *
 * Returns null when the rider has held nothing, which callers must treat as
 * "no results" rather than "no filter" — an empty or= string would match every
 * row in the table.
 *
 * Exported for tests, same reason computeCancellationCharge is.
 */
export function buildOwnershipScope(rentals: RiderRental[]): string | null {
    // Earliest assignment per vehicle — a rider who held the same unit twice
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
 * Maintenance events for vehicles this rider has personally held.
 *
 * SCOPED PER VEHICLE TO THE RIDER'S FIRST ASSIGNMENT. `description` is
 * staff-authored free text about a specific incident, so returning every
 * ticket on a vehicle the rider once had would show them another rider's
 * damage report.
 *
 * The rider's history comes from `rental_vehicle_assignments` rather than
 * `rentals` — a rental no longer names a vehicle, and this needs every unit
 * they have held, including temp ones.
 *
 * Deliberately a lower bound only, with no ceiling at release:
 * moveRideToMaintenance releases the assignment AND opens the ticket in one
 * flow, so an upper bound would race that write and hide the ticket for damage
 * the rider themselves just reported.
 */
export async function getMyMaintenanceHistory(
    userId: string,
    filters: MyMaintenanceHistoryFilters,
): Promise<Paginated<MaintenanceView>> {
    let assignmentsQuery = supabaseAdmin
        .from("rental_vehicle_assignments")
        .select("vehicle_id, assigned_at, rentals!inner(user_id)")
        .eq("rentals.user_id", userId);

    if (filters.vehicleId) assignmentsQuery = assignmentsQuery.eq("vehicle_id", filters.vehicleId);

    const { data: assignments, error: assignmentsError } = await assignmentsQuery;
    if (assignmentsError) throw assignmentsError;

    const held: RiderRental[] = (assignments ?? []).map((a) => ({
        vehicle_id: a.vehicle_id,
        started_at: a.assigned_at,
    }));

    const ownershipFilter = buildOwnershipScope(held);
    if (!ownershipFilter) return paginate([], 0, filters);

    const [from, to] = toRange(filters);
    let query = supabaseAdmin
        .from("maintenance_tickets")
        .select(`${MAINTENANCE_COLUMNS}, vehicle_id`, { count: "exact" })
        .or(ownershipFilter);

    if (filters.status) query = query.eq("status", filters.status);

    const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<RawMaintenanceRow & { vehicle_id: string }>;
    const derived = await deriveForTickets(rows.map((r) => ({ id: r.id, vehicle_id: r.vehicle_id })));
    const items = rows.map((r) => toMaintenanceView(r, derived.get(r.id) ?? EMPTY_DERIVED));
    return paginate(items, count ?? 0, filters);
}

/**
 * What the rider's home screen renders — the newest open ticket where THEY
 * were the one displaced, if any. Disappears the instant the ticket resolves
 * (any outcome), so this never surfaces raw historical assignment data.
 *
 * `displaced_rider_id` is gone, so this can no longer be a single filtered
 * read. It finds the open tickets on vehicles the rider has held, then keeps
 * the newest one the derivation actually attributes to them.
 */
export async function getMyMaintenanceNotice(userId: string): Promise<MaintenanceNoticeView | null> {
    const { data: assignments, error: assignmentsError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .select("vehicle_id, rentals!inner(user_id)")
        .eq("rentals.user_id", userId);
    if (assignmentsError) throw assignmentsError;

    const vehicleIds = [...new Set((assignments ?? []).map((a) => a.vehicle_id))];
    if (vehicleIds.length === 0) return null;

    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, vehicle_id, outcome, expected_ready_at")
        .in("vehicle_id", vehicleIds)
        .in("status", ["reported", "triaged", "in_progress"])
        .order("created_at", { ascending: false });
    if (error) throw error;

    const tickets = data ?? [];
    if (tickets.length === 0) return null;

    const derived = await deriveForTickets(
        tickets.map((t) => ({ id: t.id, vehicle_id: t.vehicle_id })),
    );

    const mine = tickets.find((t) => derived.get(t.id)?.displaced_rider?.id === userId);
    if (!mine) return null;

    const stage: MaintenanceNoticeStage =
        mine.outcome === "quick_fix" ? "quick_fix"
            : mine.outcome === "temp_vehicle" ? "temp_vehicle"
                : "pending_triage";

    return {
        ticket_id: mine.id,
        stage,
        expected_ready_at: mine.expected_ready_at,
        temp_vehicle: derived.get(mine.id)?.temp_vehicle ?? null,
    };
}

// ---------------------------------------------------------------------------
// Admin/staff — across the whole fleet
// ---------------------------------------------------------------------------

export async function listMaintenance(
    filters: ListMaintenanceFilters,
): Promise<Paginated<AdminMaintenanceRow>> {
    let query = supabaseAdmin
        .from("maintenance_tickets")
        .select(`${ADMIN_MAINTENANCE_COLUMNS}, vehicle_id`, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.vehicleId) query = query.eq("vehicle_id", filters.vehicleId);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<RawAdminMaintenanceRow & { vehicle_id: string }>;
    const derived = await deriveForTickets(rows.map((r) => ({ id: r.id, vehicle_id: r.vehicle_id })));

    return paginate(
        rows.map((r) => toAdminMaintenanceRow(r, derived.get(r.id) ?? EMPTY_DERIVED)),
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
        .from("maintenance_tickets")
        .insert({
            vehicle_id: input.vehicle_id,
            reported_by_user_id: actor.id,
            description: input.description,
            status: input.status ?? "reported",
        })
        .select("id")
        .single();

    if (error) throw error;
    const ticket = await readAdminRow(data.id);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.created",
        entityType: "maintenance_ticket",
        entityId: ticket.id,
        after: { vehicle_id: input.vehicle_id, status: ticket.status },
    });

    await notify({
        notificationType: "maintenance_review_needed",
        referenceType: "maintenance_ticket",
        referenceId: ticket.id,
        title: "Maintenance Ticket Reported",
        bodyFallback: `{vehicle} needs triage: ${input.description}`,
        screen: "/maintenance",
        vehicleId: input.vehicle_id,
        vehicleNameOverride: ticket.vehicle
            ? `${ticket.vehicle.name} (${ticket.vehicle.registration_number})`
            : undefined,
        excludeUserId: actor.id,
    });

    return ticket;
}

interface TicketState {
    id: string;
    vehicle_id: string;
    status: MaintenanceStatus;
    outcome: MaintenanceOutcome | null;
    derived: TicketDerived;
}

/** Lightweight internal read used by the triage/resolve actions to check guards before writing. */
async function requireTicketState(id: string): Promise<TicketState> {
    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, vehicle_id, status, outcome")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");

    const derived = await deriveForTickets([{ id: data.id, vehicle_id: data.vehicle_id }]);
    return { ...data, derived: derived.get(data.id) ?? EMPTY_DERIVED };
}

function assertOpenAndUntriaged(ticket: TicketState): void {
    if (ticket.status === "resolved" || ticket.status === "cancelled") {
        throw businessRule("This ticket is already closed.");
    }
    if (ticket.outcome) throw businessRule("This ticket has already been triaged.");
}

/**
 * Moves a rental onto a different vehicle.
 *
 * Closes the open assignment and opens a new one against the SAME rental. The
 * triggers on this table call `recompute_vehicle_status()` for both vehicles,
 * so the one being released and the one being taken both end up with the right
 * status without either being written directly.
 */
async function swapRentalVehicle(
    rentalId: string,
    newVehicleId: string,
    reason: "initial" | "temp_swap" | "replacement",
    maintenanceTicketId: string,
): Promise<void> {
    const now = new Date().toISOString();

    const { error: releaseError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .update({ released_at: now })
        .eq("rental_id", rentalId)
        .is("released_at", null);
    if (releaseError) throw releaseError;

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
        .from("vehicles")
        .select("id, hub_id, status")
        .eq("id", newVehicleId)
        .maybeSingle();
    if (vehicleError) throw vehicleError;
    if (!vehicle) throw notFound("Vehicle not found.");
    if (vehicle.status !== "available") {
        throw businessRule("That vehicle is not available to hand over.");
    }

    const { error } = await supabaseAdmin.from("rental_vehicle_assignments").insert({
        rental_id: rentalId,
        vehicle_id: newVehicleId,
        reason,
        maintenance_ticket_id: maintenanceTicketId,
        assigned_at: now,
        assigned_hub_id: vehicle.hub_id,
    });
    if (error) {
        if ((error as { code?: string }).code === "23505") {
            throw businessRule("That vehicle was just assigned elsewhere — refresh and try again.");
        }
        throw error;
    }
}

/** Admin verifies the vehicle can be fixed same-day — no temp vehicle needed. */
export async function triageQuickFix(
    id: string,
    input: QuickFixInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    assertOpenAndUntriaged(ticket);

    const { error } = await supabaseAdmin
        .from("maintenance_tickets")
        .update({
            outcome: "quick_fix",
            expected_ready_at: input.expected_ready_at,
            status: ticket.status === "reported" ? "in_progress" : ticket.status,
            triaged_by_user_id: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw error;

    const updated = await readAdminRow(id);
    const rider = ticket.derived.displaced_rider;

    if (rider) {
        await notifyUser(rider.id, {
            template: "maintenance_quick_fix",
            title: "Your Scooter Is Being Repaired",
            body: `Expected ready by ${new Date(input.expected_ready_at).toLocaleString()}.`,
            screen: "home",
        });
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider?.id ?? null,
        action: "maintenance.outcome_set",
        entityType: "maintenance_ticket",
        entityId: id,
        after: { outcome: "quick_fix", expected_ready_at: input.expected_ready_at },
    });

    return updated;
}

/**
 * Admin verifies the vehicle needs longer repair — hands the displaced rider a
 * temp vehicle so they aren't blocked.
 *
 * The rider keeps the same rental and the same subscription; only the
 * assignment changes. That is the substantive difference from the old flow,
 * which closed the rental and opened another one, and is why the billing
 * plan survives a swap without any of the reconnection machinery this used to
 * need.
 */
export async function assignTempVehicle(
    id: string,
    input: AssignTempVehicleInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    const ticket = await requireTicketState(id);
    assertOpenAndUntriaged(ticket);

    const rider = ticket.derived.displaced_rider;
    const rentalId = ticket.derived.rental_id;
    if (!rider || !rentalId) {
        throw businessRule("No displaced rider recorded for this ticket — cannot issue a temp vehicle.");
    }
    if (input.temp_vehicle_id === ticket.vehicle_id) {
        throw businessRule("Pick a different vehicle to use as the temporary unit.");
    }

    await swapRentalVehicle(rentalId, input.temp_vehicle_id, "temp_swap", id);

    const { error } = await supabaseAdmin
        .from("maintenance_tickets")
        .update({
            outcome: "temp_vehicle",
            status: ticket.status === "reported" ? "in_progress" : ticket.status,
            triaged_by_user_id: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw error;

    // The rider's existing plan continues on the temp vehicle — never
    // restarted or re-charged just because the vehicle changed.
    if (ticket.derived.subscription_id) {
        await resumeSubscription(ticket.derived.subscription_id, id, "temp_vehicle", actor);
    }

    await notifyUser(rider.id, {
        template: "maintenance_temp_vehicle",
        title: "Temporary Vehicle Assigned",
        body: "Your scooter is being repaired — use this temporary vehicle until it's ready.",
        screen: "home",
    });

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider.id,
        action: "maintenance.outcome_set",
        entityType: "maintenance_ticket",
        entityId: id,
        after: { outcome: "temp_vehicle", temp_vehicle_id: input.temp_vehicle_id },
    });

    return readAdminRow(id);
}

/**
 * Admin verifies the vehicle can't be fixed — disposes of it and closes the
 * ticket immediately. Reassigning the displaced rider to a replacement is a
 * deliberately separate, retryable step (reassignAfterScrap) so a failure
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

    const { error } = await supabaseAdmin
        .from("maintenance_tickets")
        .update({
            outcome: "not_repairable",
            status: "resolved",
            resolved_at: new Date().toISOString(),
            triaged_by_user_id: actor.id,
            triaged_at: new Date().toISOString(),
        })
        .eq("id", id);
    if (error) throw error;

    await writeAudit({
        actorId: actor.id,
        targetUserId: ticket.derived.displaced_rider?.id ?? null,
        action: "maintenance.outcome_set",
        entityType: "maintenance_ticket",
        entityId: id,
        after: { outcome: "not_repairable" },
    });

    return readAdminRow(id);
}

/**
 * One-way follow-up to resolveNotRepairable: permanently hands the displaced
 * rider a new vehicle. Idempotent on the replacement assignment, so a retry
 * after a failed attempt can't double-assign.
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
    if (ticket.derived.replacement_vehicle) {
        throw businessRule("A replacement vehicle has already been assigned for this ticket.");
    }

    const rider = ticket.derived.displaced_rider;
    const rentalId = ticket.derived.rental_id;
    if (!rider || !rentalId) {
        throw businessRule("No displaced rider recorded for this ticket — nothing to reassign.");
    }

    await swapRentalVehicle(rentalId, input.replacement_vehicle_id, "replacement", id);

    // The rider's existing plan continues on the replacement vehicle — the old
    // one was disposed of, but this is not a new booking or a new charge.
    if (ticket.derived.subscription_id) {
        await resumeSubscription(ticket.derived.subscription_id, id, "replacement", actor);
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: rider.id,
        action: "maintenance.outcome_set",
        entityType: "maintenance_ticket",
        entityId: id,
        after: { replacement_vehicle_id: input.replacement_vehicle_id },
    });

    return readAdminRow(id);
}

export async function updateMaintenanceTicket(
    id: string,
    patch: UpdateMaintenanceInput,
    actor: AuthContext,
): Promise<AdminMaintenanceRow> {
    if (patch.status === "resolved") {
        const ticket = await requireTicketState(id);

        if (ticket.status !== "resolved" && ticket.status !== "cancelled") {
            const rider = ticket.derived.displaced_rider;
            const rentalId = ticket.derived.rental_id;

            if (ticket.outcome && rider && rentalId) {
                // Hand the original vehicle back. The rider is currently on
                // the temp unit, so this swaps the same rental back — the old
                // flow had to close one rental and open another, and needed
                // the vehicle to be 'available' first, which meant releasing
                // it from maintenance before the handover. Neither step is
                // needed now: `recompute_vehicle_status()` frees the original
                // as soon as this ticket is marked resolved below, and the
                // swap is a single pair of assignment rows.
                //
                // `initial` rather than a fourth reason: from the rental's
                // point of view this is its own vehicle coming back, which is
                // what the history should read as.
                await swapRentalVehicle(rentalId, ticket.vehicle_id, "initial", id);

                if (ticket.derived.subscription_id) {
                    await resumeSubscription(
                        ticket.derived.subscription_id, id, "original_handback", actor,
                    );
                }

                await notifyUser(rider.id, {
                    template: "maintenance_vehicle_returned",
                    title: "Your Scooter Is Ready",
                    body: ticket.outcome === "temp_vehicle"
                        ? "Your original scooter is back and ready. The temporary vehicle has been released."
                        : "Your scooter has been repaired and is ready to ride.",
                    screen: "home",
                });
            }
        }
    }

    const next: Record<string, unknown> = { ...patch };
    // resolved_at is server-derived from the status transition, never client-supplied.
    if (patch.status) next.resolved_at = patch.status === "resolved" ? new Date().toISOString() : null;

    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .update(next as never)
        .eq("id", id)
        .select("id")
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Maintenance ticket not found.");

    // Closing the ticket is what frees the vehicle: recompute_vehicle_status()
    // reads the open-ticket count, so `releaseVehicleIfNoOpenTickets` — which
    // used to write `status: 'available'` directly, guarding against other
    // open tickets by hand — is now one RPC with the same guard inside it.
    const { error: recomputeError } = await supabaseAdmin.rpc("recompute_vehicle_status", {
        p_vehicle_id: (await requireTicketState(id)).vehicle_id,
    });
    if (recomputeError) throw recomputeError;

    const ticket = await readAdminRow(id);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "maintenance.updated",
        entityType: "maintenance_ticket",
        entityId: ticket.id,
        before: null,
        after: next,
    });

    return ticket;
}
