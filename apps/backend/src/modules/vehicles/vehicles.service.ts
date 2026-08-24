import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { AppError, businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { adminCancelBooking } from "../bookings/bookings.service";
import { completeRide } from "../rentals/rentals.service";
import { Paginated, AuthContext } from "../../types";
import { businessToday, endOfBusinessDay } from "../../common/dates";
import {
    CreateVehicleInput, ListVehiclesFilters, ScrapRecordRow, ScrapVehicleInput, UpdateVehicleInput,
    VehicleBookingRow, VehicleDetail, VehicleDocumentRow, VehicleMaintenanceRow, VehiclePaymentStatus,
    VehicleRentalRow, VehicleRow,
} from "./vehicles.types";

/**
 * The fleet.
 *
 * Nine columns left this table. Six were specification, and belong to the
 * MODEL rather than the unit: `manufacturer`, `model`, `battery_percentage`,
 * `battery_number`, and the two service dates. Two were insurance, and belong
 * to `vehicle_documents` alongside registration and PUC. One, `active`, was a
 * second way of saying `status = 'retired'`.
 *
 * `vehicle_photos` went too — the audit found it held zero rows and duplicated
 * the model image (docs/database-audit/05-initial-problems.md). Vehicle
 * imagery lives on the model, in `vehicle_model_media`; a photo of a specific
 * unit's damage lives on the incident. The upload/delete endpoints are gone
 * with the table.
 *
 * Two structural changes matter more than the renames:
 *
 *   `vehicles.status` is READ-ONLY. `recompute_vehicle_status()` owns it,
 *   driven by triggers on maintenance tickets, rental assignments and booking
 *   holds. Nothing here writes it, and the guarded-UPDATE-as-a-lock trick that
 *   `assignVehicleToUser` used to rely on had to be replaced.
 *
 *   `rentals.vehicle_id` is gone. Which vehicle a rental holds is a row in
 *   `rental_vehicle_assignments`, because a rental can change vehicle
 *   mid-term. `v_rental_current_vehicle` is the view that resolves the open one.
 */

const VEHICLE_COLUMNS = `
    id, display_name, registration_number, vin, vehicle_model_id, hub_id,
    status, colour, qr_code, imei, purchased_on, batch_number, created_at, updated_at,
    vehicle_models(name)
`;

interface RawVehicleRow {
    id: string;
    display_name: string | null;
    registration_number: string;
    vin: string;
    vehicle_model_id: string;
    hub_id: string | null;
    status: VehicleRow["status"];
    colour: string | null;
    qr_code: string | null;
    imei: string | null;
    purchased_on: string | null;
    batch_number: string | null;
    created_at: string;
    updated_at: string | null;
    vehicle_models: unknown;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

function toVehicleRow(row: RawVehicleRow): VehicleRow {
    const modelName = unwrap<{ name: string }>(row.vehicle_models)?.name ?? "";
    return {
        id: row.id,
        // A unit without its own name is shown as its model — better than a
        // blank cell in the fleet table, and it is what the name meant anyway.
        name: row.display_name ?? modelName,
        registration_number: row.registration_number,
        model: modelName,
        vehicle_model_id: row.vehicle_model_id,
        vin: row.vin,
        status: row.status,
        color: row.colour,
        qr_code: row.qr_code,
        imei: row.imei,
        purchase_date: row.purchased_on,
        hub_id: row.hub_id,
        batch_number: row.batch_number,
        created_at: row.created_at,
        updated_at: row.updated_at,
        payment_status: null,
        current_rider: null,
        plan_name: null,
        plan_status: null,
        plan_start_date: null,
        plan_end_date: null,
    };
}

/**
 * Current rider + plan detail per vehicle, in bulk.
 *
 * Same join `paymentStatusesForVehicles` uses to find the open assignment,
 * extended to the rider and the plan behind their subscription.
 * `v_subscription_current_period` supplies `scheduled_ends_on` — the
 * scheduled end is never stored, since it shifts on every pause (see that
 * view's comment) — so a second query resolves it for whichever
 * subscriptions were found in the first.
 */
async function ridersAndPlansForVehicles(vehicleIds: string[]): Promise<Map<string, {
    current_rider: { id: string; full_name: string } | null;
    plan_name: string | null;
    plan_status: string | null;
    plan_start_date: string | null;
    plan_end_date: string | null;
}>> {
    const map = new Map<string, {
        current_rider: { id: string; full_name: string } | null;
        plan_name: string | null;
        plan_status: string | null;
        plan_start_date: string | null;
        plan_end_date: string | null;
    }>();
    if (vehicleIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("vehicle_id, users(id, full_name), subscriptions(id, status, started_on, plans(name))")
        .in("vehicle_id", vehicleIds);
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<{
        vehicle_id: string;
        users: unknown;
        subscriptions: unknown;
    }>;

    const subscriptionIds = rows
        .map((r) => unwrap<{ id: string }>(r.subscriptions)?.id)
        .filter((id): id is string => !!id);

    const endDates = new Map<string, string | null>();
    if (subscriptionIds.length > 0) {
        const { data: periods, error: periodsError } = await supabaseAdmin
            .from("v_subscription_current_period")
            .select("subscription_id, scheduled_ends_on")
            .in("subscription_id", subscriptionIds);
        if (periodsError) throw periodsError;
        for (const p of (periods ?? []) as Array<{ subscription_id: string; scheduled_ends_on: string | null }>) {
            endDates.set(p.subscription_id, p.scheduled_ends_on);
        }
    }

    for (const row of rows) {
        const rider = unwrap<{ id: string; full_name: string }>(row.users);
        const subscription = unwrap<{ id: string; status: string; started_on: string; plans: unknown }>(
            row.subscriptions,
        );
        const plan = subscription ? unwrap<{ name: string }>(subscription.plans) : null;

        map.set(row.vehicle_id, {
            current_rider: rider,
            plan_name: plan?.name ?? null,
            plan_status: subscription?.status ?? null,
            plan_start_date: subscription?.started_on ?? null,
            plan_end_date: subscription ? endDates.get(subscription.id) ?? null : null,
        });
    }

    return map;
}

/**
 * Payment/billing status per vehicle.
 *
 * Two sources now, because the commercial state split in two. A vehicle held
 * by a paid-up rider is answered by their `subscriptions` row, reached through
 * the open rental assignment; a vehicle merely *reserved* by an unpaid booking
 * is answered by `bookings.status` via `held_vehicle_id`.
 *
 * The subscription wins where both exist: a scooter in someone's hands is
 * described by their subscription, not by the booking that produced it.
 */
async function paymentStatusesForVehicles(
    vehicleIds: string[],
): Promise<Map<string, VehiclePaymentStatus>> {
    const map = new Map<string, VehiclePaymentStatus>();
    if (vehicleIds.length === 0) return map;

    const [assignedRes, heldRes] = await Promise.all([
        supabaseAdmin
            .from("v_rental_current_vehicle")
            .select("vehicle_id, subscriptions(status)")
            .in("vehicle_id", vehicleIds),
        supabaseAdmin
            .from("bookings")
            .select("held_vehicle_id, status, created_at")
            .in("held_vehicle_id", vehicleIds)
            .in("status", ["pending_payment", "confirmed"])
            .order("created_at", { ascending: false }),
    ]);
    if (assignedRes.error) throw assignedRes.error;
    if (heldRes.error) throw heldRes.error;

    for (const row of heldRes.data ?? []) {
        if (!row.held_vehicle_id || map.has(row.held_vehicle_id)) continue;
        map.set(row.held_vehicle_id, row.status as VehiclePaymentStatus);
    }

    for (const row of assignedRes.data ?? []) {
        if (!row.vehicle_id) continue;
        const subscription = unwrap<{ status: string }>(row.subscriptions);
        if (subscription) map.set(row.vehicle_id, subscription.status as VehiclePaymentStatus);
    }

    return map;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listVehicles(filters: ListVehiclesFilters): Promise<Paginated<VehicleRow>> {
    let query = supabaseAdmin.from("vehicles").select(VEHICLE_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.search) {
        const term = escapeLike(filters.search);
        // `model` dropped out of the search terms: it is a joined column now,
        // and PostgREST cannot `or` across an embed. Searching by model is
        // the model filter's job, not the free-text box's.
        query = query.or(
            [
                `display_name.ilike.%${term}%`,
                `registration_number.ilike.%${term}%`,
                `vin.ilike.%${term}%`,
                `batch_number.ilike.%${term}%`,
            ].join(","),
        );
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as unknown as RawVehicleRow[]).map(toVehicleRow);
    const ids = rows.map((r) => r.id);
    const [paymentStatuses, ridersAndPlans] = await Promise.all([
        paymentStatusesForVehicles(ids),
        ridersAndPlansForVehicles(ids),
    ]);
    const enriched = rows.map((r) => ({
        ...r,
        payment_status: paymentStatuses.get(r.id) ?? null,
        ...(ridersAndPlans.get(r.id) ?? {}),
    }));

    return paginate(enriched, count ?? 0, filters);
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getVehicleById(id: string): Promise<VehicleDetail> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Vehicle not found.");

    const [documents, maintenanceHistory, rentalHistory, bookingHistory, scrapRecord] =
        await Promise.all([
            documentsForVehicle(id),
            maintenanceForVehicle(id),
            rentalsForVehicle(id),
            bookingsForVehicle(id),
            scrapRecordForVehicle(id),
        ]);

    const [paymentStatuses, ridersAndPlans] = await Promise.all([
        paymentStatusesForVehicles([id]),
        ridersAndPlansForVehicles([id]),
    ]);

    return {
        ...toVehicleRow(data as unknown as RawVehicleRow),
        payment_status: paymentStatuses.get(id) ?? null,
        ...(ridersAndPlans.get(id) ?? {}),
        documents,
        maintenance_history: maintenanceHistory,
        rental_history: rentalHistory,
        booking_history: bookingHistory,
        scrap_record: scrapRecord,
    };
}

async function scrapRecordForVehicle(vehicleId: string): Promise<ScrapRecordRow | null> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_disposals")
        .select("reason, disposed_on, salvage_amount, created_at, users(id, full_name)")
        .eq("vehicle_id", vehicleId)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
        reason: data.reason,
        scrapped_on: data.disposed_on,
        estimated_value: data.salvage_amount === null ? null : Number(data.salvage_amount),
        approved_by: unwrap(data.users),
        created_at: data.created_at,
    };
}

async function documentsForVehicle(vehicleId: string): Promise<VehicleDocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_documents")
        .select("id, document_type, document_number, issued_on, expires_on")
        .eq("vehicle_id", vehicleId)
        .order("expires_on", { ascending: true });
    if (error) throw error;

    return (data ?? []).map((row) => ({
        id: row.id,
        doc_type: row.document_type,
        doc_number: row.document_number,
        issued_date: row.issued_on,
        expires_on: row.expires_on,
    }));
}

/**
 * Maintenance history, with whatever vehicle the rider was given meanwhile.
 *
 * The old `vehicle_maintenance.temp_vehicle_id` column is gone. A handover is
 * a `rental_vehicle_assignments` row stamped with the ticket that caused it,
 * which is strictly more expressive — one ticket can produce a temp vehicle
 * and then a permanent replacement, and the old column could only hold one.
 * The most recent such assignment is reported, matching what the column used
 * to end up containing.
 */
async function maintenanceForVehicle(vehicleId: string): Promise<VehicleMaintenanceRow[]> {
    const { data, error } = await supabaseAdmin
        .from("maintenance_tickets")
        .select("id, status, description, resolved_at, created_at, outcome, expected_ready_at")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
    if (error) throw error;

    const tickets = data ?? [];
    if (tickets.length === 0) return [];

    const { data: handovers, error: handoverError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .select("maintenance_ticket_id, assigned_at, vehicles(id, display_name, registration_number, vehicle_models(name))")
        .in("maintenance_ticket_id", tickets.map((t) => t.id))
        .order("assigned_at", { ascending: false });
    if (handoverError) throw handoverError;

    const byTicket = new Map<string, { id: string; name: string; registration_number: string }>();
    for (const row of handovers ?? []) {
        if (!row.maintenance_ticket_id || byTicket.has(row.maintenance_ticket_id)) continue;
        const v = unwrap<{
            id: string; display_name: string | null; registration_number: string; vehicle_models: unknown;
        }>(row.vehicles);
        if (!v) continue;
        const modelName = unwrap<{ name: string }>(v.vehicle_models)?.name ?? "";
        byTicket.set(row.maintenance_ticket_id, {
            id: v.id,
            name: v.display_name ?? modelName,
            registration_number: v.registration_number,
        });
    }

    return tickets.map((row) => ({
        id: row.id,
        status: row.status,
        description: row.description,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        outcome: row.outcome,
        expected_ready_at: row.expected_ready_at,
        temp_vehicle: byTicket.get(row.id) ?? null,
    }));
}

/**
 * Rentals that have held this vehicle.
 *
 * Reached through the assignment table rather than a `rentals.vehicle_id`
 * filter, and the return details come from `rental_returns` — the four
 * `return_*` columns left the rentals row when the return became a workflow
 * with its own states.
 */
async function rentalsForVehicle(vehicleId: string): Promise<VehicleRentalRow[]> {
    const { data, error } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .select(`
            assigned_at,
            rentals(
                id, status, picked_up_at, returned_at, due_back_at,
                users(id, full_name),
                rental_returns(requested_at, requested_reason, rider_notes, due_back_at)
            )
        `)
        .eq("vehicle_id", vehicleId)
        .order("assigned_at", { ascending: false })
        .limit(20);
    if (error) throw error;

    const rows: VehicleRentalRow[] = [];
    const seen = new Set<string>();

    for (const assignment of data ?? []) {
        const rental = unwrap<{
            id: string; status: string; picked_up_at: string; returned_at: string | null;
            due_back_at: string; users: unknown; rental_returns: unknown;
        }>(assignment.rentals);
        // One rental can hold the same vehicle twice (out for repair, back
        // again), which would otherwise list it twice.
        if (!rental || seen.has(rental.id)) continue;
        seen.add(rental.id);

        // `reason` and `feedback` were the OLD column names and neither
        // exists — the table has `requested_reason` and `rider_notes`. The
        // whole embed 400'd, so the vehicle detail page's rental history was
        // dead. Missed by tsc because supabase-js cannot parse this select
        // (the `users(...)` / nested embeds defeat it), so the string
        // degrades to unchecked. Same class as invoices.service.ts and
        // audit.service.ts; see docs/final-system-audit.
        const ret = unwrap<{
            requested_at: string | null; requested_reason: string | null;
            rider_notes: string | null; due_back_at: string | null;
        }>(rental.rental_returns);

        rows.push({
            id: rental.id,
            status: rental.status,
            started_at: rental.picked_up_at,
            ended_at: rental.returned_at,
            rider: unwrap<{ id: string; full_name: string }>(rental.users),
            return_requested_at: ret?.requested_at ?? null,
            return_reason: ret?.requested_reason ?? null,
            return_feedback: ret?.rider_notes ?? null,
            // An approved return can move the due date; the rental's own is
            // the fallback. This is the effectiveDueAt() rule, inlined.
            return_due_at: ret?.due_back_at ?? rental.due_back_at,
        });
    }

    return rows;
}

/** Bookings that have (at some point) reserved this vehicle. */
async function bookingsForVehicle(vehicleId: string): Promise<VehicleBookingRow[]> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("id, status, requested_start_on, created_at, users(id, full_name), subscriptions(status)")
        .eq("held_vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) throw error;

    return (data ?? []).map((row) => ({
        id: row.id,
        status: row.status,
        plan_status:
            (unwrap<{ status: string }>(row.subscriptions)?.status as VehicleBookingRow["plan_status"]) ?? null,
        start_day: row.requested_start_on,
        created_at: row.created_at,
        rider: unwrap<{ id: string; full_name: string }>(row.users),
    }));
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createVehicle(
    input: CreateVehicleInput,
    actor: AuthContext,
    req?: Request,
): Promise<VehicleRow> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .insert({
            display_name: input.name ?? null,
            registration_number: input.registration_number,
            vin: input.vin,
            vehicle_model_id: input.vehicle_model_id,
            hub_id: input.hub_id ?? null,
            colour: input.color ?? null,
            qr_code: input.qr_code ?? null,
            imei: input.imei ?? null,
            purchased_on: input.purchase_date ?? null,
            batch_number: input.batch_number ?? null,
            // No `status`: the column defaults to 'available' and
            // recompute_vehicle_status() maintains it from there.
        })
        .select(VEHICLE_COLUMNS)
        .single();

    if (error) throw mapPostgresError(error);

    const vehicle = toVehicleRow(data as unknown as RawVehicleRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        after: {
            registration_number: vehicle.registration_number,
            vin: vehicle.vin,
            status: vehicle.status,
        },
        req,
    });

    return vehicle;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateVehicle(
    id: string,
    patch: UpdateVehicleInput,
    actor: AuthContext,
    req?: Request,
): Promise<VehicleRow> {
    const before = await requireVehicle(id);

    // Releasing a reserved vehicle.
    //
    // Status is no longer settable, so the old "admin flips reserved →
    // available" path cannot be expressed as a column write at all. That is
    // an improvement: the flip was never the real action. Cancelling the
    // booking is, and `recompute_vehicle_status()` frees the vehicle as a
    // consequence — which is what the old code ended up doing anyway, via a
    // release trigger, after a comment explaining why it dropped `status`
    // from the write to avoid racing it.
    if (before.status === "reserved") {
        const { data: liveBooking, error: bookingError } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("held_vehicle_id", id)
            .in("status", ["pending_payment", "confirmed"])
            .maybeSingle();
        if (bookingError) throw bookingError;
        if (liveBooking) {
            await adminCancelBooking(liveBooking.id, "Vehicle released by admin.", actor);
        }
    }

    const columns: Record<string, unknown> = {};
    if (patch.name !== undefined) columns.display_name = patch.name;
    if (patch.registration_number !== undefined) columns.registration_number = patch.registration_number;
    if (patch.vin !== undefined) columns.vin = patch.vin;
    if (patch.hub_id !== undefined) columns.hub_id = patch.hub_id;
    if (patch.color !== undefined) columns.colour = patch.color;
    if (patch.qr_code !== undefined) columns.qr_code = patch.qr_code;
    if (patch.imei !== undefined) columns.imei = patch.imei;
    if (patch.purchase_date !== undefined) columns.purchased_on = patch.purchase_date;
    if (patch.batch_number !== undefined) columns.batch_number = patch.batch_number;

    let vehicle: VehicleRow;
    if (Object.keys(columns).length === 0) {
        vehicle = await requireVehicle(id);
    } else {
        const { data, error } = await supabaseAdmin
            .from("vehicles")
            .update(columns as never)
            .eq("id", id)
            .select(VEHICLE_COLUMNS)
            .maybeSingle();

        if (error) throw mapPostgresError(error);
        if (!data) throw notFound("Vehicle not found.");

        vehicle = toVehicleRow(data as unknown as RawVehicleRow);
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.updated",
        entityType: "vehicle",
        entityId: vehicle.id,
        before: pick(before, Object.keys(patch)),
        after: patch,
        req,
    });

    return vehicle;
}

async function requireVehicle(id: string): Promise<VehicleRow> {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select(VEHICLE_COLUMNS)
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Vehicle not found.");
    return toVehicleRow(data as unknown as RawVehicleRow);
}

function pick<T extends object>(source: T, keys: string[]): Record<string, unknown> {
    const record = source as unknown as Record<string, unknown>;
    return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]));
}

/** PostgREST treats % and _ as wildcards inside ilike patterns. */
function escapeLike(input: string): string {
    return input.replace(/[%_\\,()]/g, "");
}

/** 23505 = unique_violation on registration_number / vin / qr_code / imei / batch_number. */
function mapPostgresError(error: { code?: string; message?: string }): Error {
    if (error.code === "23505") {
        if (error.message?.includes("registration_number")) {
            return conflict("This registration number is already in use.", {
                registration_number: "This registration number is already in use.",
            });
        }
        if (error.message?.includes("vin")) {
            return conflict("This VIN is already in use.", { vin: "This VIN is already in use." });
        }
        if (error.message?.includes("qr_code")) {
            return conflict("This QR code is already in use.", { qr_code: "This QR code is already in use." });
        }
        if (error.message?.includes("imei")) {
            return conflict("This IMEI is already in use.", { imei: "This IMEI is already in use." });
        }
        if (error.message?.includes("batch_number")) {
            return conflict("This batch number is already in use.", {
                batch_number: "This batch number is already in use.",
            });
        }
        return conflict("That value is already in use.");
    }
    return error as Error;
}

// ---------------------------------------------------------------------------
// Dispose — terminal state.
// ---------------------------------------------------------------------------

/**
 * Retires a vehicle permanently.
 *
 * The disposal row is what makes this terminal: `recompute_vehicle_status()`
 * reads it and derives `retired`. The old version wrote `status: 'scrap'` and
 * `active: false` itself, needing both because `allocate_vehicle_for_booking`
 * filtered on `active` rather than on status. The new allocator filters on
 * status alone, so one fact does the job of two.
 */
export async function scrapVehicle(
    id: string,
    input: ScrapVehicleInput,
    actor: AuthContext,
): Promise<VehicleRow> {
    const vehicle = await requireVehicle(id);
    if (vehicle.status !== "maintenance") {
        throw businessRule("Only a vehicle currently in maintenance can be scrapped.");
    }

    const { error: recordError } = await supabaseAdmin.from("vehicle_disposals").insert({
        vehicle_id: id,
        reason: input.reason,
        disposed_on: input.scrapped_on ?? businessToday(),
        approved_by_user_id: actor.id,
        salvage_amount: input.estimated_value ?? null,
    });
    if (recordError) {
        if ((recordError as { code?: string }).code === "23505") {
            throw conflict("This vehicle has already been disposed of.");
        }
        throw recordError;
    }

    const { error: recomputeError } = await supabaseAdmin.rpc("recompute_vehicle_status", {
        p_vehicle_id: id,
    });
    if (recomputeError) throw recomputeError;

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.scrapped",
        entityType: "vehicle",
        entityId: id,
        before: { status: "maintenance" },
        after: { status: "retired", reason: input.reason, estimated_value: input.estimated_value ?? null },
    });

    return requireVehicle(id);
}

// ---------------------------------------------------------------------------
// Assign
// ---------------------------------------------------------------------------

/**
 * Largely superseded by the booking flow's allocate_vehicle_for_booking() +
 * POST /bookings/:id/pickup. Kept working for any direct caller, but new code
 * should go through bookings, not this.
 */
export async function assignVehicle(vehicleId: string, userId: string) {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .select("id, status")
        .eq("id", vehicleId)
        .eq("status", "available")
        .maybeSingle();

    if (error || !data) throw new AppError(400, "Vehicle unavailable or not found");
    return data;
}

export interface AssignVehicleToUserResult {
    vehicle: VehicleRow;
    /** The rentals row this handover just opened — callers resuming a paused subscription need it. */
    rentalId: string;
}

/**
 * Staff hand a specific available vehicle straight to a specific rider — no
 * booking involved (walk-in handovers, replacements, demo units). Mirrors
 * bookings.service.ts's confirmPickup(): opens the same `rentals` row a
 * booking-based pickup would, plus the `rental_vehicle_assignments` row that
 * actually attaches the vehicle.
 *
 * **The concurrency story changed.** The old version claimed the vehicle with
 * `UPDATE vehicles SET status='assigned' WHERE status='available'`, using the
 * guarded update as a lock: two racing calls, one winner. That is no longer
 * available, because nothing may write `status`.
 *
 * The lock is now the assignment row itself. A partial unique index permits
 * only one open (`released_at IS NULL`) assignment per vehicle, so the loser
 * of a race gets 23505 on the insert instead of zero rows from the update.
 * The check-then-act read below is a courtesy that produces a good error
 * message in the common case; the index is what makes it correct.
 *
 * A rider can only ever have one active rental. If they already hold a
 * different vehicle this refuses by default (409, `active_rental_id` in
 * `fields`) rather than silently opening a second concurrent rental — pass
 * `unassignExisting: true` to close the old one through completeRide() first.
 */
export async function assignVehicleToUser(
    vehicleId: string,
    userId: string,
    actor: AuthContext,
    subscriptionId?: string,
    options?: { unassignExisting?: boolean },
): Promise<AssignVehicleToUserResult> {
    const { data: rider, error: riderError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, deleted_at, rider_profiles(kyc_status)")
        .eq("id", userId)
        .maybeSingle();
    if (riderError) throw riderError;
    if (!rider || rider.deleted_at) throw notFound("Rider not found.");

    const kycStatus = unwrap<{ kyc_status: string }>(rider.rider_profiles)?.kyc_status;
    if (kycStatus !== "verified") {
        throw businessRule("This rider's KYC must be verified before handing over a vehicle.");
    }

    const { data: existingRental, error: existingRentalError } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("rental_id, vehicle_id, vehicles(id, display_name, registration_number, vehicle_models(name))")
        .eq("user_id", userId)
        .maybeSingle();
    if (existingRentalError) throw existingRentalError;

    if (existingRental?.rental_id && existingRental.vehicle_id !== vehicleId) {
        const v = unwrap<{
            id: string; display_name: string | null; registration_number: string; vehicle_models: unknown;
        }>(existingRental.vehicles);
        const existingName = v?.display_name ?? unwrap<{ name: string }>(v?.vehicle_models)?.name ?? null;

        if (!options?.unassignExisting) {
            throw conflict(
                `${rider.full_name} already has ${existingName ?? "a scooter"} assigned. Unassign it before handing over a new one.`,
                {
                    active_rental_id: existingRental.rental_id,
                    existing_vehicle_id: v?.id ?? "",
                    existing_vehicle_name: existingName ?? "",
                    existing_vehicle_registration: v?.registration_number ?? "",
                },
            );
        }
        await completeRide(existingRental.rental_id, {}, actor);
    }

    const vehicle = await requireVehicle(vehicleId);
    if (vehicle.status !== "available") {
        throw businessRule("This vehicle is not available to assign.");
    }

    // A rental needs a subscription. A walk-in handover with no subscription
    // behind it has nothing to attach the rental to — the FK is NOT NULL —
    // so this refuses rather than inventing one.
    if (!subscriptionId) {
        throw businessRule(
            "A subscription is required before a vehicle can be handed over. " +
            "Take payment for a plan first.",
        );
    }

    const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .insert({
            user_id: userId,
            subscription_id: subscriptionId,
            status: "active",
            picked_up_at: new Date().toISOString(),
            due_back_at: await dueBackForSubscription(subscriptionId),
        })
        .select("id")
        .single();
    if (rentalError) {
        if ((rentalError as { code?: string }).code === "23505") {
            throw conflict("This rider already has an active rental — refresh and try again.");
        }
        throw rentalError;
    }

    const { error: assignmentError } = await supabaseAdmin
        .from("rental_vehicle_assignments")
        .insert({
            rental_id: rental.id,
            vehicle_id: vehicleId,
            reason: "initial",
            assigned_hub_id: vehicle.hub_id,
        });
    if (assignmentError) {
        // Compensating write: a rental with no vehicle attached is worse than
        // no rental at all, because recompute_vehicle_status() would leave the
        // scooter available while the rider believes they have it.
        await supabaseAdmin.from("rentals").delete().eq("id", rental.id);
        if ((assignmentError as { code?: string }).code === "23505") {
            throw conflict("This vehicle was just assigned elsewhere — refresh and try again.");
        }
        throw assignmentError;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "vehicle.assigned",
        entityType: "vehicle",
        entityId: vehicleId,
        after: { status: "assigned", user_id: userId, rental_id: rental.id },
    });

    await notifyUser(userId, {
        template: "vehicle_assigned",
        title: "Scooter Assigned to You",
        body: "Staff has handed you a scooter. Enjoy your ride!",
        screen: "post-booking-dashboard",
    });

    await notify({
        notificationType: "vehicle_assigned",
        referenceType: "rental",
        referenceId: rental.id,
        title: "Vehicle Assigned",
        bodyFallback: "{vehicle} was handed over to {rider}.",
        screen: "/bookings",
        riderId: userId,
        vehicleId,
        excludeUserId: actor.id,
    });

    return { vehicle: await requireVehicle(vehicleId), rentalId: rental.id };
}

/**
 * When the scooter is due back: the end of the subscription's current period.
 *
 * `rentals.due_back_at` is NOT NULL, and the period is the only thing that
 * knows the answer — the rental is due back when the rider stops paying for it.
 */
async function dueBackForSubscription(subscriptionId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("v_subscription_current_period")
        .select("ends_on")
        .eq("subscription_id", subscriptionId)
        .maybeSingle();
    if (error) throw error;
    if (!data?.ends_on) {
        throw businessRule("This subscription has no current billing period to rent against.");
    }
    // End of the last usable day, not its midnight — a rider whose period ends
    // on the 17th has the whole of the 17th. In IST: `T23:59:59Z` would be
    // 05:29:59 IST on the 18th, giving away five and a half hours.
    return endOfBusinessDay(data.ends_on);
}
