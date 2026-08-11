import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { notifyUser } from "../notifications/notifications.service";
import { createMaintenanceTicket } from "../maintenance/maintenance.service";
import { updateVehicle } from "../vehicles/vehicles.service";
import { AuthContext, Paginated } from "../../types";
import {
    CreateSupportInput, SupportHistoryFilters, SupportQueueFilters, SupportQueueView,
    SupportView, UpdateSupportInput,
} from "./support.types";

const SUPPORT_COLUMNS = "id, subject, description, status, priority, resolved_at, created_at";

const QUEUE_COLUMNS = `
    id, subject, description, status, priority, resolved_at, created_at, assigned_to,
    rental_id, vehicle_id,
    users!user_id(id, full_name, phone)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawSupportRow {
    id: string;
    subject: string;
    description: string;
    status: SupportView["status"];
    priority: SupportView["priority"];
    resolved_at: string | null;
    created_at: string;
}

interface RawSupportQueueRow extends RawSupportRow {
    assigned_to: string | null;
    rental_id: string | null;
    vehicle_id: string | null;
    users: unknown;
}

export function toSupportView(row: RawSupportRow): SupportView {
    return {
        id: row.id,
        subject: row.subject,
        description: row.description,
        status: row.status,
        priority: row.priority,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
    };
}

function toSupportQueueView(row: RawSupportQueueRow): SupportQueueView {
    return {
        ...toSupportView(row),
        assigned_to: row.assigned_to,
        rental_id: row.rental_id,
        vehicle_id: row.vehicle_id,
        rider: unwrap<SupportQueueView["rider"]>(row.users) ?? { id: "", full_name: "Unknown rider", phone: null },
    };
}

/**
 * Riders raise a ticket with just a subject/description; when they have a
 * live ride, silently attach it (rental_id/vehicle_id) so staff have that
 * context without asking the rider which scooter they mean.
 */
export async function createSupportRequest(
    userId: string,
    input: CreateSupportInput,
): Promise<SupportView> {
    const { data: activeRental } = await supabaseAdmin
        .from("rentals")
        .select("id, vehicle_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    const { data, error } = await supabaseAdmin
        .from("support_requests")
        .insert({
            user_id: userId,
            subject: input.subject,
            description: input.description,
            rental_id: activeRental?.id ?? null,
            vehicle_id: activeRental?.vehicle_id ?? null,
        })
        .select(SUPPORT_COLUMNS)
        .single();

    if (error) throw error;
    return toSupportView(data as unknown as RawSupportRow);
}

export async function getMyRequests(
    userId: string,
    filters: SupportHistoryFilters,
): Promise<Paginated<SupportView>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("support_requests")
        .select(SUPPORT_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawSupportRow[]).map(toSupportView);
    return paginate(items, count ?? 0, filters);
}

export async function listSupportQueue(
    filters: SupportQueueFilters,
): Promise<Paginated<SupportQueueView>> {
    const [from, to] = toRange(filters);
    let query = supabaseAdmin
        .from("support_requests")
        .select(QUEUE_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);

    const { data, error, count } = await query
        .order(filters.sortBy, { ascending: filters.sortDir === "asc" })
        .range(from, to);

    if (error) throw error;
    const items = ((data ?? []) as unknown as RawSupportQueueRow[]).map(toSupportQueueView);
    return paginate(items, count ?? 0, filters);
}

export async function getSupportDetail(id: string): Promise<SupportQueueView> {
    const { data, error } = await supabaseAdmin
        .from("support_requests")
        .select(QUEUE_COLUMNS)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Support request not found.");
    return toSupportQueueView(data as unknown as RawSupportQueueRow);
}

/**
 * Staff status/priority/assignment update. Moving off 'open' with nobody
 * assigned yet claims it for the acting staff member — one less step than
 * requiring an explicit "assign to me" call first. A status change notifies
 * the rider (mirrors bookings.service.ts's pickup-confirmed notification).
 */
export async function updateSupportRequest(
    id: string,
    patch: UpdateSupportInput,
    actor: AuthContext,
): Promise<SupportQueueView> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("support_requests")
        .select("id, user_id, subject, status, assigned_to, vehicle_id")
        .eq("id", id)
        .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw notFound("Support request not found.");

    const update: Record<string, unknown> = {};
    if (patch.status) update.status = patch.status;
    if (patch.priority) update.priority = patch.priority;
    if (patch.assigned_to) update.assigned_to = patch.assigned_to;

    if (patch.status && patch.status !== "open" && !patch.assigned_to && !existing.assigned_to) {
        update.assigned_to = actor.id;
    }
    if (patch.status && (patch.status === "resolved" || patch.status === "closed")) {
        update.resolved_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
        .from("support_requests")
        .update(update)
        .eq("id", id)
        .select(QUEUE_COLUMNS)
        .single();

    if (error) throw error;

    if (patch.status && patch.status !== existing.status) {
        await notifyUser(existing.user_id, {
            template: "support_status_updated",
            title: "Support Request Updated",
            body: `Your request "${existing.subject}" is now ${patch.status.replace("_", " ")}.`,
            screen: "support",
        });
    }

    // Staff moving a vehicle-linked ticket into 'in_progress' means they've
    // confirmed it's a real vehicle problem — pull the vehicle out of service
    // by flagging it for maintenance, same as a manual "mark in maintenance".
    if (patch.status === "in_progress" && existing.status !== "in_progress" && existing.vehicle_id) {
        const { data: vehicle, error: vehicleError } = await supabaseAdmin
            .from("vehicles")
            .select("id, status")
            .eq("id", existing.vehicle_id)
            .maybeSingle();
        if (vehicleError) throw vehicleError;

        if (vehicle && vehicle.status !== "maintenance" && vehicle.status !== "scrap") {
            await createMaintenanceTicket(
                {
                    vehicle_id: existing.vehicle_id,
                    description: `Auto-flagged from support ticket "${existing.subject}".`,
                    status: "in_progress",
                },
                actor,
            );
            await updateVehicle(existing.vehicle_id, { status: "maintenance" }, actor);
        }
    }

    return toSupportQueueView(data as unknown as RawSupportQueueRow);
}
