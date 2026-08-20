import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { notifyUser } from "../notifications/notifications.service";
import { createMaintenanceTicket } from "../maintenance/maintenance.service";
import { AuthContext, Paginated } from "../../types";
import {
    CreateSupportInput, SupportHistoryFilters, SupportQueueFilters, SupportQueueView,
    SupportView, UpdateSupportInput,
} from "./support.types";

/**
 * Support.
 *
 * `support_requests` is `support_tickets`, and the single `description`
 * column became `support_ticket_messages` — a thread, with authors and an
 * `is_internal_note` flag. That is the substantive change: a ticket was
 * previously a one-way statement with no way to record a reply, so every
 * conversation happened somewhere else and none of it was on the record.
 *
 * The wire shape still exposes `description`, resolved as the FIRST message
 * on the thread, so neither app has to change in this stage.
 *
 * `vehicle_id` also went: a ticket names the rental, and the rental names the
 * vehicle — which stays correct when a maintenance swap changes it, where the
 * copied column would have gone stale.
 */

const TICKET_COLUMNS = `
    id, subject, status, priority, category, resolved_at, created_at,
    support_ticket_messages(body, created_at, is_internal_note)
`;

const QUEUE_COLUMNS = `
    ${TICKET_COLUMNS},
    assigned_to_user_id, rental_id,
    users!user_id(id, full_name, phone)
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawSupportRow {
    id: string;
    subject: string;
    status: SupportView["status"];
    priority: SupportView["priority"];
    resolved_at: string | null;
    created_at: string;
    support_ticket_messages: unknown;
}

interface RawSupportQueueRow extends RawSupportRow {
    assigned_to_user_id: string | null;
    rental_id: string | null;
    users: unknown;
}

/**
 * The rider's opening message.
 *
 * Internal notes are excluded — the old `description` was always rider-facing
 * text, and surfacing a staff note under that name would leak it to the app.
 */
function openingMessage(raw: unknown): string {
    const rows = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<{
        body: string; created_at: string; is_internal_note: boolean;
    }>;
    const visible = rows
        .filter((m) => !m.is_internal_note)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return visible[0]?.body ?? "";
}

export function toSupportView(row: RawSupportRow): SupportView {
    return {
        id: row.id,
        subject: row.subject,
        description: openingMessage(row.support_ticket_messages),
        status: row.status,
        priority: row.priority,
        resolved_at: row.resolved_at,
        created_at: row.created_at,
    };
}

function toSupportQueueView(row: RawSupportQueueRow): SupportQueueView {
    return {
        ...toSupportView(row),
        assigned_to: row.assigned_to_user_id,
        rental_id: row.rental_id,
        // Derived from the rental rather than stored — see the header.
        vehicle_id: null,
        rider: unwrap<SupportQueueView["rider"]>(row.users)
            ?? { id: "", full_name: "Unknown rider", phone: null },
    };
}

/**
 * Riders raise a ticket with a subject and a first message; when they have a
 * live ride, it is attached silently so staff have that context without
 * asking which scooter they mean.
 */
export async function createSupportRequest(
    userId: string,
    input: CreateSupportInput,
): Promise<SupportView> {
    const { data: activeRental } = await supabaseAdmin
        .from("rentals")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();

    const { data: ticket, error } = await supabaseAdmin
        .from("support_tickets")
        .insert({
            user_id: userId,
            subject: input.subject,
            rental_id: activeRental?.id ?? null,
        })
        .select("id")
        .single();
    if (error) throw error;

    const { error: messageError } = await supabaseAdmin.from("support_ticket_messages").insert({
        support_ticket_id: ticket.id,
        author_user_id: userId,
        body: input.description,
        is_internal_note: false,
    });
    if (messageError) {
        // A ticket with no message is unreadable — better to have neither.
        await supabaseAdmin.from("support_tickets").delete().eq("id", ticket.id);
        throw messageError;
    }

    const { data, error: readError } = await supabaseAdmin
        .from("support_tickets")
        .select(TICKET_COLUMNS)
        .eq("id", ticket.id)
        .single();
    if (readError) throw readError;

    return toSupportView(data as unknown as RawSupportRow);
}

export async function getMyRequests(
    userId: string,
    filters: SupportHistoryFilters,
): Promise<Paginated<SupportView>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("support_tickets")
        .select(TICKET_COLUMNS, { count: "exact" })
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
        .from("support_tickets")
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
        .from("support_tickets")
        .select(QUEUE_COLUMNS)
        .eq("id", id)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Support request not found.");
    return toSupportQueueView(data as unknown as RawSupportQueueRow);
}

/**
 * Staff status/priority/assignment update. Moving off `open` with nobody
 * assigned claims it for the acting staff member — one less step than
 * requiring an explicit "assign to me" call first.
 */
export async function updateSupportRequest(
    id: string,
    patch: UpdateSupportInput,
    actor: AuthContext,
): Promise<SupportQueueView> {
    const { data: existing, error: existingError } = await supabaseAdmin
        .from("support_tickets")
        .select("id, user_id, subject, status, assigned_to_user_id, rental_id")
        .eq("id", id)
        .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) throw notFound("Support request not found.");

    const update: Record<string, unknown> = {};
    if (patch.status) update.status = patch.status;
    if (patch.priority) update.priority = patch.priority;
    if (patch.assigned_to) update.assigned_to_user_id = patch.assigned_to;

    if (patch.status && patch.status !== "open" && !patch.assigned_to && !existing.assigned_to_user_id) {
        update.assigned_to_user_id = actor.id;
    }
    if (patch.status && (patch.status === "resolved" || patch.status === "closed")) {
        update.resolved_at = new Date().toISOString();
    }

    const { error } = await supabaseAdmin
        .from("support_tickets")
        .update(update as never)
        .eq("id", id);
    if (error) throw error;

    if (patch.status && patch.status !== existing.status) {
        await notifyUser(existing.user_id, {
            template: "support_status_updated",
            title: "Support Request Updated",
            body: `Your request "${existing.subject}" is now ${patch.status.replace("_", " ")}.`,
            screen: "support",
        });
    }

    // Staff moving a ride-linked ticket into 'in_progress' means they have
    // confirmed a real vehicle problem — open a maintenance ticket, which is
    // what takes the scooter out of service.
    //
    // The old version ALSO wrote `vehicles.status = 'maintenance'` directly.
    // It no longer can, and no longer needs to: `recompute_vehicle_status()`
    // derives that from the open ticket, so the two can't disagree.
    if (patch.status === "in_progress" && existing.status !== "in_progress" && existing.rental_id) {
        const { data: current, error: vehicleError } = await supabaseAdmin
            .from("v_rental_current_vehicle")
            .select("vehicle_id, vehicles(status)")
            .eq("rental_id", existing.rental_id)
            .maybeSingle();
        if (vehicleError) throw vehicleError;

        const vehicle = unwrap<{ status: string }>(current?.vehicles);
        if (current?.vehicle_id && vehicle && vehicle.status !== "maintenance" && vehicle.status !== "retired") {
            await createMaintenanceTicket(
                {
                    vehicle_id: current.vehicle_id,
                    description: `Auto-flagged from support ticket "${existing.subject}".`,
                    status: "in_progress",
                },
                actor,
            );
        }
    }

    return getSupportDetail(id);
}
