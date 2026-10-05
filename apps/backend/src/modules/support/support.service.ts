import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { notifyUser } from "../notifications/notifications.service";
import { notify } from "../notifications/notify.service";
import { assignReplacementVehicle, createMaintenanceTicket, triagePausePlan } from "../maintenance/maintenance.service";
import { RiderImpactPlan, RiderImpactPreview } from "../maintenance/maintenance.types";
import { AuthContext, Paginated } from "../../types";
import {
    CreateSupportInput, SupportHistoryFilters, SupportQueueFilters, SupportQueueView,
    SupportView, UpdateSupportInput,
} from "./support.types";

/**
 * The vehicle a ride-linked ticket would flag for maintenance, if any —
 * shared by getRiderImpactPreview (what the UI checks before showing the
 * decision) and updateSupportRequest (what the backend re-checks before
 * acting, so the rule holds even if a caller skips the preview).
 *
 * Returns null when there's nothing to flag: no rental on the ticket, or the
 * vehicle is already out of service.
 */
async function findFlaggableVehicle(
    rentalId: string,
): Promise<{ id: string; display_name: string | null; registration_number: string; status: string } | null> {
    const { data: current, error } = await supabaseAdmin
        .from("v_rental_current_vehicle")
        .select("vehicle_id, vehicles(id, display_name, registration_number, status)")
        .eq("rental_id", rentalId)
        .maybeSingle();
    if (error) throw error;

    const vehicle = unwrap<{ id: string; display_name: string | null; registration_number: string; status: string }>(
        current?.vehicles,
    );
    if (!current?.vehicle_id || !vehicle || vehicle.status === "maintenance" || vehicle.status === "retired") {
        return null;
    }
    return vehicle;
}

/** The active rider and plan on a rental — what the rider-impact modal needs beyond the vehicle. */
async function loadRiderImpactContext(rentalId: string): Promise<{
    riderId: string;
    rider: { id: string; full_name: string; phone: string | null } | null;
    plan?: RiderImpactPlan;
}> {
    const { data: rental, error } = await supabaseAdmin
        .from("rentals")
        .select("user_id, subscription_id, users(id, full_name, phone)")
        .eq("id", rentalId)
        .maybeSingle();
    if (error) throw error;
    if (!rental) throw notFound("Rental not found.");

    const rider = unwrap<{ id: string; full_name: string; phone: string | null }>(rental.users);

    let plan: RiderImpactPlan | undefined;
    if (rental.subscription_id) {
        const [subRes, periodRes, balancesRes] = await Promise.all([
            supabaseAdmin
                .from("subscriptions")
                .select("status, bookings(plans(name))")
                .eq("id", rental.subscription_id)
                .maybeSingle(),
            supabaseAdmin
                .from("subscription_periods")
                .select("starts_on, due_on")
                .eq("subscription_id", rental.subscription_id)
                .eq("status", "current")
                .maybeSingle(),
            supabaseAdmin
                .from("v_invoice_balances")
                .select("balance_amount")
                .eq("subscription_id", rental.subscription_id)
                .eq("is_paid", false),
        ]);
        if (subRes.error) throw subRes.error;
        if (periodRes.error) throw periodRes.error;
        if (balancesRes.error) throw balancesRes.error;

        const booking = unwrap<{ plans: unknown }>(subRes.data?.bookings);
        const planRef = unwrap<{ name: string }>(booking?.plans);
        const outstanding = (balancesRes.data ?? []).reduce((sum, b) => sum + Number(b.balance_amount), 0);

        plan = {
            subscription_id: rental.subscription_id,
            plan_name: planRef?.name ?? null,
            plan_status: subRes.data?.status ?? null,
            current_period_start: periodRes.data?.starts_on ?? null,
            next_due_at: periodRes.data?.due_on ?? null,
            outstanding_amount: outstanding,
        };
    }

    return { riderId: rental.user_id, rider, plan };
}

/**
 * What the Support Ticket page checks before it dare move a ride-linked
 * ticket to 'in_progress'. `required: true` means the transition would
 * displace an active rider and the UI must collect a Replace-or-Pause
 * decision first (see updateSupportRequest's `rider_impact`).
 */
export async function getRiderImpactPreview(id: string): Promise<RiderImpactPreview> {
    const { data: ticket, error } = await supabaseAdmin
        .from("support_tickets")
        .select("id, status, rental_id")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!ticket) throw notFound("Support request not found.");

    // Matches updateSupportRequest's own guard exactly: this only matters for
    // a transition INTO 'in_progress' from anything else.
    if (!ticket.rental_id || ticket.status === "in_progress") return { required: false };

    const vehicle = await findFlaggableVehicle(ticket.rental_id);
    if (!vehicle) return { required: false };

    const { rider, plan } = await loadRiderImpactContext(ticket.rental_id);

    return {
        required: true,
        vehicle: {
            id: vehicle.id,
            name: vehicle.display_name ?? "",
            registration_number: vehicle.registration_number,
            status: vehicle.status,
        },
        rider: rider ?? undefined,
        plan,
    };
}

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

    // Staff previously found out about a new ticket only by happening to
    // look at the Support queue — createSupportRequest had no admin-facing
    // notify() call at all.
    await notify({
        notificationType: "support_ticket_created",
        referenceType: "support_ticket",
        referenceId: ticket.id,
        title: "New Support Ticket",
        bodyFallback: `{rider} raised a ticket: "${input.subject}".`,
        screen: "/support",
        riderId: userId,
    });

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

    // Staff moving a ride-linked ticket into 'in_progress' means they have
    // confirmed a real vehicle problem, which is what takes the scooter out
    // of service below. A vehicle still held by an active rider cannot just
    // vanish into maintenance out from under them — staff must say what
    // happens to that rider's plan in the same breath, and this is enforced
    // HERE, not only in the Support Ticket UI, so no other caller (a future
    // bulk action, another page) can silently strand a rider — see
    // getRiderImpactPreview for the read-only check the UI uses to avoid
    // ever hitting this the hard way.
    //
    // Checked and thrown BEFORE any write below: a ticket that fails this
    // must come back exactly as it was, not half-transitioned to
    // 'in_progress' (and the rider already told so) with nobody having
    // decided what happens to them.
    const enteringProgress = patch.status === "in_progress" && existing.status !== "in_progress";
    const flaggableVehicle = enteringProgress && existing.rental_id
        ? await findFlaggableVehicle(existing.rental_id)
        : null;
    if (flaggableVehicle && !patch.rider_impact) {
        throw businessRule(
            "This vehicle is assigned to an active rider. Choose how their plan should be handled before starting maintenance.",
            { requires_rider_impact: "true" },
        );
    }

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

    // Open the maintenance ticket — which is what takes the scooter out of
    // service. The old version ALSO wrote `vehicles.status = 'maintenance'`
    // directly. It no longer can, and no longer needs to:
    // `recompute_vehicle_status()` derives that from the open ticket, so the
    // two can't disagree.
    if (flaggableVehicle) {
        const ticket = await createMaintenanceTicket(
            {
                vehicle_id: flaggableVehicle.id,
                description: `Auto-flagged from support ticket "${existing.subject}".`,
                status: "in_progress",
            },
            actor,
        );

        if (patch.rider_impact!.action === "replace") {
            await assignReplacementVehicle(
                ticket.id,
                { temp_vehicle_id: patch.rider_impact!.replacement_vehicle_id },
                actor,
            );
        } else {
            await triagePausePlan(ticket.id, actor);
        }
    }

    return getSupportDetail(id);
}
