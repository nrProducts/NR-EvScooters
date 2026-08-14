import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { AppError, businessRule, conflict, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { writeAudit } from "../../common/audit";
import { notifyUser } from "../notifications/notifications.service";
import { adminCancelBooking } from "../bookings/bookings.service";
import { completeRide } from "../rentals/rentals.service";
import { Paginated, AuthContext } from "../../types";
import {
    buildVehiclePhotoPath, createSignedVehiclePhotoUrl, removeVehiclePhotoFile, uploadVehiclePhotoFile,
} from "./vehicles.photo.storage";
import type { UploadedFile } from "../kyc/kyc.storage";
import {
    CreateVehicleInput, ListVehiclesFilters, ScrapRecordRow, ScrapVehicleInput, UpdateVehicleInput,
    VehicleBookingRow, VehicleDetail, VehicleDocumentRow, VehicleMaintenanceRow, VehiclePaymentStatus,
    VehiclePhotoRow, VehicleRentalRow, VehicleRow,
} from "./vehicles.types";

const VEHICLE_COLUMNS = `
    id, name, registration_number, battery_number, manufacturer, model, vin,
    battery_percentage, status, last_service_date, next_service_due_date,
    active, color, qr_code, imei, purchase_date, insurance_number, insurance_expiry,
    created_at, updated_at
`;

/** Postgres `numeric` columns round-trip through PostgREST as strings, not numbers. */
function toVehicleRow(row: VehicleRow): VehicleRow {
    return { ...row, battery_percentage: Number(row.battery_percentage) };
}

/**
 * Payment/billing status per vehicle, derived from whichever booking
 * currently holds it — bookings.vehicle_id is never cleared on close (see
 * confirmPickup's comment), so a vehicle can have several past bookings;
 * only a live one (not cancelled/expired) is ever relevant, and a vehicle's
 * status trigger machinery guarantees at most one is live at a time.
 */
async function paymentStatusesForVehicles(vehicleIds: string[]): Promise<Map<string, VehiclePaymentStatus>> {
    const map = new Map<string, VehiclePaymentStatus>();
    if (vehicleIds.length === 0) return map;

    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("vehicle_id, status, plan_status, created_at")
        .in("vehicle_id", vehicleIds)
        .in("status", ["pending_payment", "confirmed", "fulfilled"])
        .order("created_at", { ascending: false });
    if (error) throw error;

    for (const row of (data ?? []) as { vehicle_id: string | null; status: string; plan_status: string | null; created_at: string }[]) {
        if (!row.vehicle_id || map.has(row.vehicle_id)) continue; // newest first — first hit per vehicle wins
        map.set(row.vehicle_id, (row.status === "fulfilled" ? row.plan_status : row.status) as VehiclePaymentStatus);
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
        query = query.or(
            [
                `name.ilike.%${term}%`,
                `registration_number.ilike.%${term}%`,
                `vin.ilike.%${term}%`,
                `model.ilike.%${term}%`,
            ].join(","),
        );
    }

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = ((data ?? []) as unknown as VehicleRow[]).map(toVehicleRow);
    const paymentStatuses = await paymentStatusesForVehicles(rows.map((r) => r.id));
    const withPaymentStatus = rows.map((r) => ({ ...r, payment_status: paymentStatuses.get(r.id) ?? null }));

    return paginate(withPaymentStatus, count ?? 0, filters);
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

    const [documents, photos, maintenanceHistory, rentalHistory, bookingHistory, scrapRecord] = await Promise.all([
        documentsForVehicle(id),
        photosForVehicle(id),
        maintenanceForVehicle(id),
        rentalsForVehicle(id),
        bookingsForVehicle(id),
        scrapRecordForVehicle(id),
    ]);

    const currentRental = rentalHistory.find((r) => r.status === "active") ?? null;
    const paymentStatuses = await paymentStatusesForVehicles([id]);

    return {
        ...toVehicleRow(data as unknown as VehicleRow),
        payment_status: paymentStatuses.get(id) ?? null,
        documents,
        photos,
        maintenance_history: maintenanceHistory,
        rental_history: rentalHistory,
        booking_history: bookingHistory,
        current_rider: currentRental?.rider ?? null,
        scrap_record: scrapRecord,
    };
}

async function scrapRecordForVehicle(vehicleId: string): Promise<ScrapRecordRow | null> {
    const { data, error } = await supabaseAdmin
        .from("scrap_records")
        .select("id, reason, scrapped_on, estimated_value, created_at, users(id, full_name)")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
        id: data.id,
        reason: data.reason,
        scrapped_on: data.scrapped_on,
        estimated_value: data.estimated_value === null ? null : Number(data.estimated_value),
        approved_by: unwrap(data.users),
        created_at: data.created_at,
    };
}

async function documentsForVehicle(vehicleId: string): Promise<VehicleDocumentRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_documents")
        .select("id, doc_type, doc_number, issued_date, expiry_date")
        .eq("vehicle_id", vehicleId)
        .order("expiry_date", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as VehicleDocumentRow[];
}

async function maintenanceForVehicle(vehicleId: string): Promise<VehicleMaintenanceRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_maintenance")
        .select(`
            id, status, description, resolved_at, created_at, outcome, expected_ready_at,
            temp_vehicle:vehicles!temp_vehicle_id(id, name, registration_number)
        `)
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false });
    if (error) throw error;

    return ((data ?? []) as unknown as Array<{
        id: string; status: VehicleMaintenanceRow["status"]; description: string; resolved_at: string | null;
        created_at: string; outcome: VehicleMaintenanceRow["outcome"]; expected_ready_at: string | null;
        temp_vehicle: unknown;
    }>).map((row) => ({
        id: row.id,
        status: row.status,
        description: row.description,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
        outcome: row.outcome,
        expected_ready_at: row.expected_ready_at,
        temp_vehicle: unwrap<{ id: string; name: string; registration_number: string }>(row.temp_vehicle),
    }));
}

async function rentalsForVehicle(vehicleId: string): Promise<VehicleRentalRow[]> {
    const { data, error } = await supabaseAdmin
        .from("rentals")
        .select(`
            id, status, started_at, ended_at, users(id, full_name),
            return_requested_at, return_reason, return_feedback, return_due_at
        `)
        .eq("vehicle_id", vehicleId)
        .order("started_at", { ascending: false })
        .limit(20);
    if (error) throw error;

    return ((data ?? []) as unknown as Array<{
        id: string; status: string; started_at: string; ended_at: string | null; users: unknown;
        return_requested_at: string | null; return_reason: string | null;
        return_feedback: string | null; return_due_at: string | null;
    }>).map((row) => ({
        id: row.id,
        status: row.status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        rider: unwrap<{ id: string; full_name: string }>(row.users),
        return_requested_at: row.return_requested_at,
        return_reason: row.return_reason,
        return_feedback: row.return_feedback,
        return_due_at: row.return_due_at,
    }));
}

/** Bookings that have (at some point) held this vehicle — the "booked" leg of its lifecycle. */
async function bookingsForVehicle(vehicleId: string): Promise<VehicleBookingRow[]> {
    const { data, error } = await supabaseAdmin
        .from("bookings")
        .select("id, status, plan_status, start_day, created_at, users!bookings_user_id_fkey(id, full_name)")
        .eq("vehicle_id", vehicleId)
        .order("created_at", { ascending: false })
        .limit(20);
    if (error) throw error;

    return ((data ?? []) as unknown as Array<{
        id: string; status: string; plan_status: VehicleBookingRow["plan_status"];
        start_day: string; created_at: string; users: unknown;
    }>).map((row) => ({
        id: row.id,
        status: row.status,
        plan_status: row.plan_status,
        start_day: row.start_day,
        created_at: row.created_at,
        rider: unwrap<{ id: string; full_name: string }>(row.users),
    }));
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

async function photosForVehicle(vehicleId: string): Promise<VehiclePhotoRow[]> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_photos")
        .select("id, url, is_primary, sort_order, created_at")
        .eq("vehicle_id", vehicleId)
        .order("sort_order", { ascending: true });
    if (error) throw error;

    const rows = (data ?? []) as Array<{ id: string; url: string; is_primary: boolean; sort_order: number; created_at: string }>;
    return Promise.all(
        rows.map(async (row) => ({
            id: row.id,
            url: await createSignedVehiclePhotoUrl(row.url),
            is_primary: row.is_primary,
            sort_order: row.sort_order,
            created_at: row.created_at,
        })),
    );
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function uploadVehiclePhoto(
    vehicleId: string,
    file: UploadedFile,
    mime: "image/jpeg" | "image/png",
    isPrimary: boolean,
): Promise<VehiclePhotoRow> {
    await requireVehicle(vehicleId);

    const path = buildVehiclePhotoPath(vehicleId, mime);
    await uploadVehiclePhotoFile(path, file, mime);

    if (isPrimary) {
        await supabaseAdmin.from("vehicle_photos").update({ is_primary: false }).eq("vehicle_id", vehicleId);
    }

    const { data, error } = await supabaseAdmin
        .from("vehicle_photos")
        .insert({ vehicle_id: vehicleId, url: path, is_primary: isPrimary })
        .select("id, url, is_primary, sort_order, created_at")
        .single();

    if (error) {
        await removeVehiclePhotoFile(path);
        throw error;
    }

    return {
        id: data.id,
        url: await createSignedVehiclePhotoUrl(data.url),
        is_primary: data.is_primary,
        sort_order: data.sort_order,
        created_at: data.created_at,
    };
}

export async function deleteVehiclePhoto(vehicleId: string, photoId: string): Promise<void> {
    const { data, error } = await supabaseAdmin
        .from("vehicle_photos")
        .select("id, url")
        .eq("id", photoId)
        .eq("vehicle_id", vehicleId)
        .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound("Photo not found.");

    const { error: deleteError } = await supabaseAdmin.from("vehicle_photos").delete().eq("id", photoId);
    if (deleteError) throw deleteError;

    await removeVehiclePhotoFile(data.url);
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
            name: input.name,
            registration_number: input.registration_number,
            battery_number: input.battery_number,
            manufacturer: input.manufacturer,
            model: input.model,
            vin: input.vin,
            battery_percentage: input.battery_percentage ?? 100,
            status: input.status ?? "available",
            last_service_date: input.last_service_date ?? null,
            next_service_due_date: input.next_service_due_date ?? null,
            color: input.color ?? null,
            qr_code: input.qr_code ?? null,
            imei: input.imei ?? null,
            purchase_date: input.purchase_date ?? null,
            insurance_number: input.insurance_number ?? null,
            insurance_expiry: input.insurance_expiry ?? null,
        })
        .select(VEHICLE_COLUMNS)
        .single();

    if (error) throw mapPostgresError(error);

    const vehicle = toVehicleRow(data as unknown as VehicleRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.created",
        entityType: "vehicle",
        entityId: vehicle.id,
        after: { registration_number: vehicle.registration_number, vin: vehicle.vin, status: vehicle.status },
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

    // A 'booked' vehicle is still held by a live pending_payment/confirmed
    // booking (bookings.vehicle_id) — force-flipping it straight to
    // 'available' here used to leave that booking dangling, so the rider's
    // app kept showing it as a current booking with a cancel option even
    // though the vehicle had already moved on. Cancel the booking properly
    // instead; trg_release_vehicle_on_booking_close_fn (20260727095801)
    // frees the vehicle back to 'available' as a side effect of that, so
    // `status` is dropped from the direct column write below to avoid
    // racing the trigger.
    const releasingFromBooking = before.status === "booked" && patch.status === "available";
    if (releasingFromBooking) {
        const { data: liveBooking, error: bookingError } = await supabaseAdmin
            .from("bookings")
            .select("id")
            .eq("vehicle_id", id)
            .in("status", ["pending_payment", "confirmed"])
            .maybeSingle();
        if (bookingError) throw bookingError;
        if (liveBooking) {
            await adminCancelBooking(liveBooking.id, "Vehicle released by admin.", actor);
        }
    }

    const columnsToWrite: UpdateVehicleInput = { ...patch };
    if (releasingFromBooking) delete columnsToWrite.status;

    let vehicle: VehicleRow;
    if (Object.keys(columnsToWrite).length === 0) {
        vehicle = await requireVehicle(id);
    } else {
        const { data, error } = await supabaseAdmin
            .from("vehicles")
            .update(columnsToWrite)
            .eq("id", id)
            .select(VEHICLE_COLUMNS)
            .maybeSingle();

        if (error) throw mapPostgresError(error);
        if (!data) throw notFound("Vehicle not found.");

        vehicle = toVehicleRow(data as unknown as VehicleRow);
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
    return data as unknown as VehicleRow;
}

function pick<T extends object>(source: T, keys: string[]): Record<string, unknown> {
    const record = source as unknown as Record<string, unknown>;
    return Object.fromEntries(keys.filter((k) => k in record).map((k) => [k, record[k]]));
}

/** PostgREST treats % and _ as wildcards inside ilike patterns. */
function escapeLike(input: string): string {
    return input.replace(/[%_\\,()]/g, "");
}

/** 23505 = unique_violation on registration_number / battery_number / vin. */
function mapPostgresError(error: { code?: string; message?: string }): Error {
    if (error.code === "23505") {
        if (error.message?.includes("registration_number")) {
            return conflict("This registration number is already in use.", {
                registration_number: "This registration number is already in use.",
            });
        }
        if (error.message?.includes("battery_number")) {
            return conflict("This battery number is already in use.", {
                battery_number: "This battery number is already in use.",
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
        return conflict("That value is already in use.");
    }
    return error as Error;
}

// ---------------------------------------------------------------------------
// Scrap — terminal state. Only a 'maintenance' vehicle may be scrapped;
// `active: false` keeps it out of allocate_vehicle_for_booking()'s pool
// (which filters on v.active) even though 'scrap' also isn't 'available'.
// ---------------------------------------------------------------------------

export async function scrapVehicle(
    id: string,
    input: ScrapVehicleInput,
    actor: AuthContext,
): Promise<VehicleRow> {
    const vehicle = await requireVehicle(id);
    if (vehicle.status !== "maintenance") {
        throw businessRule("Only a vehicle currently in maintenance can be scrapped.");
    }

    const { error: recordError } = await supabaseAdmin.from("scrap_records").insert({
        vehicle_id: id,
        reason: input.reason,
        scrapped_on: input.scrapped_on ?? new Date().toISOString().slice(0, 10),
        approved_by: actor.id,
        estimated_value: input.estimated_value ?? null,
    });
    if (recordError) throw recordError;

    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "scrap", active: false })
        .eq("id", id)
        .select(VEHICLE_COLUMNS)
        .single();
    if (error) throw error;

    const updated = toVehicleRow(data as unknown as VehicleRow);

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "vehicle.scrapped",
        entityType: "vehicle",
        entityId: id,
        before: { status: "maintenance" },
        after: { status: "scrap", reason: input.reason, estimated_value: input.estimated_value ?? null },
    });

    return updated;
}

// ---------------------------------------------------------------------------
// Assign (pre-existing) — largely superseded by the booking flow's
// allocate_vehicle_for_booking() + POST /bookings/:id/pickup (which go
// through 'booked' first, then 'assigned'). Kept working for any direct
// caller, but new code should go through bookings, not this.
// ---------------------------------------------------------------------------

export async function assignVehicle(vehicleId: string, userId: string) {
    const { data, error } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "assigned" })
        .eq("id", vehicleId)
        .eq("status", "available")
        .select()
        .single();

    if (error || !data) throw new AppError(400, "Vehicle unavailable or not found");
    return data;
}

export interface AssignVehicleToUserResult {
    vehicle: VehicleRow;
    /** The rentals row this handover just opened — callers that need to resume a paused billing plan use this. */
    rentalId: string;
}

/**
 * Staff hand a specific available vehicle straight to a specific rider —
 * no booking involved (walk-in handovers, replacements, demo units). Mirrors
 * bookings.service.ts's confirmPickup(): opens the same 'rentals' row a
 * booking-based pickup would, so Unassign/complete-ride and the vehicle's
 * assignment history work identically regardless of how the ride started.
 *
 * `bookingId` is optional and stamped onto the new rentals row when this is
 * a maintenance-flow handover (temp vehicle / handback / replacement) tied
 * to an existing booking's recurring plan — omitted for a plain walk-in
 * assignment with no booking behind it.
 *
 * The vehicle is claimed with a guarded UPDATE *before* the rentals row is
 * inserted — same reasoning as confirmPickup's step ordering: two racing
 * calls on the same vehicle (a double-click, a retry) can only ever have
 * one succeed, so at most one 'assigned' rentals row is ever created here.
 * rentals_one_active_per_vehicle_idx / _per_booking_idx (20260811100000)
 * back this up at the database level.
 *
 * A rider can only ever have one active rental. If they already hold a
 * *different* vehicle, this refuses by default (409, `active_rental_id` in
 * `fields`) rather than silently opening a second concurrent rental and
 * stranding the old vehicle stuck 'assigned' — pass `unassignExisting: true`
 * (after the caller has confirmed with staff) to close that old rental via
 * the same completeRide() a normal return goes through, then proceed.
 */
export async function assignVehicleToUser(
    vehicleId: string,
    userId: string,
    actor: AuthContext,
    bookingId?: string,
    options?: { unassignExisting?: boolean },
): Promise<AssignVehicleToUserResult> {
    const { data: rider, error: riderError } = await supabaseAdmin
        .from("users")
        .select("id, full_name, kyc_status, deleted_at")
        .eq("id", userId)
        .maybeSingle();
    if (riderError) throw riderError;
    if (!rider || rider.deleted_at) throw notFound("Rider not found.");
    if (rider.kyc_status !== "verified") {
        throw businessRule("This rider's KYC must be verified before handing over a vehicle.");
    }

    const { data: existingRental, error: existingRentalError } = await supabaseAdmin
        .from("rentals")
        .select("id, vehicle_id, vehicles(id, name, registration_number)")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
    if (existingRentalError) throw existingRentalError;

    if (existingRental && existingRental.vehicle_id !== vehicleId) {
        const existingVehicle = (Array.isArray(existingRental.vehicles) ? existingRental.vehicles[0] : existingRental.vehicles) as
            | { id: string; name: string; registration_number: string }
            | null;
        if (!options?.unassignExisting) {
            throw conflict(
                `${rider.full_name} already has ${existingVehicle?.name ?? "a scooter"} assigned. Unassign it before handing over a new one.`,
                {
                    active_rental_id: String(existingRental.id),
                    existing_vehicle_id: existingVehicle?.id ?? "",
                    existing_vehicle_name: existingVehicle?.name ?? "",
                    existing_vehicle_registration: existingVehicle?.registration_number ?? "",
                },
            );
        }
        await completeRide(String(existingRental.id), {}, actor);
    }

    const { data: claimed, error: claimError } = await supabaseAdmin
        .from("vehicles")
        .update({ status: "assigned" })
        .eq("id", vehicleId)
        .eq("status", "available")
        .select(VEHICLE_COLUMNS)
        .maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
        // Distinguish "doesn't exist" from "exists but already taken" the
        // same way the original single-select version did.
        const { data: exists } = await supabaseAdmin.from("vehicles").select("id").eq("id", vehicleId).maybeSingle();
        if (!exists) throw notFound("Vehicle not found.");
        throw businessRule("This vehicle is not available to assign.");
    }
    const updated = toVehicleRow(claimed as unknown as VehicleRow);

    const { data: rental, error: rentalError } = await supabaseAdmin
        .from("rentals")
        .insert({
            user_id: userId,
            vehicle_id: vehicleId,
            booking_id: bookingId ?? null,
            status: "active",
            started_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (rentalError) {
        // Revert the claim — there's no transaction infra here, so this
        // compensating write is what stops the vehicle being stranded
        // 'assigned' with no rental behind it.
        await supabaseAdmin.from("vehicles").update({ status: "available" }).eq("id", vehicleId);
        if ((rentalError as { code?: string }).code === "23505") {
            throw conflict("This vehicle or booking was just assigned elsewhere — refresh and try again.");
        }
        throw rentalError;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: userId,
        action: "vehicle.assigned",
        entityType: "vehicle",
        entityId: vehicleId,
        after: { status: "assigned", user_id: userId },
    });

    await notifyUser(userId, {
        template: "vehicle_assigned",
        title: "Scooter Assigned to You",
        body: "Staff has handed you a scooter. Enjoy your ride!",
        screen: "post-booking-dashboard",
    });

    return { vehicle: updated, rentalId: rental.id as string };
}
