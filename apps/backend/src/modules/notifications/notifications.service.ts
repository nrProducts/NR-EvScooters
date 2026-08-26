import { supabaseAdmin } from "../../config/supabase";
import { businessRule, notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { sendExpoPush } from "../../common/push";
import { writeAudit } from "../../common/audit";
import { AuthContext, Paginated } from "../../types";
import {
    AdminNotificationRow, BroadcastInput, BroadcastResult, ListAdminNotificationsFilters,
    ListNotificationsFilters, NotificationRow, NotifyInput,
} from "./notifications.types";

/**
 * Rider-facing notifications.
 *
 * Reading is now a join across the three tables: the message is the rider's
 * copy (title, body, read_at), the event says what happened, and the delivery
 * says whether the push made it. The old single row was all three at once.
 *
 * The `read_at` change is the one worth knowing: it lives on the MESSAGE, not
 * the delivery. Previously each channel had its own `read_at`, so a rider who
 * read a notification in-app had not "read" the email copy — two rows about
 * one thing, disagreeing.
 */

const MESSAGE_COLUMNS = `
    id, user_id, notification_type_code, title, body, read_at, created_at,
    notification_deliveries(id, channel, status, sent_at),
    notification_events(notification_type_code, subject_type, subject_id, payload)
`;

// !inner — this log is rider notification history, not staff's own inbox.
// notify()'s staff fan-out (notify.service.ts) writes into these same three
// tables with a staff/admin user_id, so without this join+filter, a "Sent to
// Riders" or dashboard "recent alerts" list would mix in messages meant for
// staff (e.g. "Maintenance Ticket Opened", sent to whoever's subscribed in
// Notification Manager) right alongside actual rider notifications.
const ADMIN_MESSAGE_COLUMNS = `${MESSAGE_COLUMNS}, users!inner(id, full_name, role)`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawMessageRow {
    id: string;
    user_id: string;
    notification_type_code: string;
    title: string;
    body: string;
    read_at: string | null;
    created_at: string;
    notification_deliveries: unknown;
    notification_events: unknown;
    users?: unknown;
}

/**
 * Flattens a message plus its deliveries back into the one-row-per-channel
 * shape both apps read. The push delivery is the one reported, since that is
 * what the old inbox row always was.
 */
function toNotificationRow(row: RawMessageRow): NotificationRow {
    const deliveries = (Array.isArray(row.notification_deliveries)
        ? row.notification_deliveries
        : []) as Array<{ channel: string; status: NotificationRow["status"]; sent_at: string | null }>;
    const push = deliveries.find((d) => d.channel === "push") ?? deliveries[0];

    const event = unwrap<{
        subject_type: string | null; subject_id: string | null; payload: Record<string, unknown> | null;
    }>(row.notification_events);
    const payload = (event?.payload ?? {}) as Record<string, string | null>;

    return {
        id: row.id,
        user_id: row.user_id,
        channel: (push?.channel as NotificationRow["channel"]) ?? "push",
        template: row.notification_type_code,
        payload: {
            title: row.title,
            body: row.body,
            screen: payload.screen ?? undefined,
        },
        status: push?.status ?? "pending",
        sent_at: push?.sent_at ?? null,
        read_at: row.read_at,
        created_at: row.created_at,
        notification_type: row.notification_type_code,
        reference_type: event?.subject_type ?? null,
        reference_id: event?.subject_id ?? null,
        booking_id: payload.booking_id ?? null,
        vehicle_id: payload.vehicle_id ?? null,
        rider_id: payload.rider_id ?? null,
    };
}

/**
 * Best-effort push delivery for an already-created `notification_deliveries`
 * row. Never throws — a delivery failure must not roll back the business
 * action that triggered it.
 *
 * The token lookup changed: a rider can have several devices now
 * (`user_devices`), so this sends to every live one rather than the single
 * `users.push_token` that whichever device logged in last had overwritten.
 */
export async function deliverPush(
    deliveryId: string,
    userId: string,
    input: Pick<NotifyInput, "title" | "body" | "screen" | "template">,
): Promise<void> {
    const { data: devices, error: deviceError } = await supabaseAdmin
        .from("user_devices")
        .select("push_token")
        .eq("user_id", userId)
        .is("revoked_at", null);

    const tokens = (devices ?? []).map((d) => d.push_token).filter(Boolean);
    if (deviceError || tokens.length === 0) return; // No device yet — stays 'pending'.

    try {
        await Promise.all(tokens.map((token) => sendExpoPush(token, {
            title: input.title, body: input.body, data: { screen: input.screen },
        })));
        await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", deliveryId);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[notifications] push delivery failed", {
            userId, template: input.template, error: message,
        });
        await supabaseAdmin
            .from("notification_deliveries")
            .update({ status: "failed", error: message })
            .eq("id", deliveryId);
    }
}

/**
 * The one function every module calls to notify a rider.
 *
 * Three rows where there was one: the event, the rider's message, and the
 * push delivery. Persists first — the message is the source of truth — then
 * attempts delivery. Never throws.
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
    try {
        const typeCode = input.notification_type ?? input.template;

        const { data: event, error: eventError } = await supabaseAdmin
            .from("notification_events")
            .insert({
                notification_type_code: typeCode,
                subject_type: input.reference_type ?? "user",
                subject_id: input.reference_id ?? userId,
                payload: {
                    booking_id: input.booking_id ?? null,
                    vehicle_id: input.vehicle_id ?? null,
                    rider_id: input.rider_id ?? null,
                    screen: input.screen ?? null,
                    template: input.template,
                },
            })
            .select("id")
            .single();
        if (eventError) throw eventError;

        const { data: message, error: messageError } = await supabaseAdmin
            .from("notification_messages")
            .insert({
                notification_event_id: event.id,
                notification_type_code: typeCode,
                user_id: userId,
                title: input.title,
                body: input.body,
            })
            .select("id")
            .single();
        if (messageError) throw messageError;

        const { data: delivery, error: deliveryError } = await supabaseAdmin
            .from("notification_deliveries")
            .insert({ notification_message_id: message.id, channel: "push", status: "pending" })
            .select("id")
            .single();
        if (deliveryError) throw deliveryError;

        await deliverPush(delivery.id, userId, input);
    } catch (err) {
        console.error("[notifications] failed to record notification", {
            userId, template: input.template,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}

export async function listMyNotifications(
    userId: string,
    filters: ListNotificationsFilters,
): Promise<Paginated<NotificationRow>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("notification_messages")
        .select(MESSAGE_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    // The old `channel = 'push'` filter is gone: a message is one row now
    // whatever channels carried it, so an inbox can no longer show duplicates.
    return paginate(
        ((data ?? []) as unknown as RawMessageRow[]).map(toNotificationRow),
        count ?? 0,
        filters,
    );
}

export async function unreadCount(userId: string): Promise<{ count: number }> {
    const { count, error } = await supabaseAdmin
        .from("notification_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

    if (error) throw error;
    return { count: count ?? 0 };
}

export async function markRead(userId: string, id: string): Promise<NotificationRow> {
    const { data, error } = await supabaseAdmin
        .from("notification_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select(MESSAGE_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Notification not found.");
    return toNotificationRow(data as unknown as RawMessageRow);
}

export async function markAllRead(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("notification_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("read_at", null);

    if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin — fleet-wide notification log + broadcast
// ---------------------------------------------------------------------------

export async function listAllNotifications(
    filters: ListAdminNotificationsFilters,
): Promise<Paginated<AdminNotificationRow>> {
    // Status is the DELIVERY's, so filtering it means filtering the embed, and
    // `!inner` is what makes that restrict the message rather than null it
    // out. The select is chosen up front rather than the query being rebuilt
    // mid-function, so there is only ever one builder and one inferred type.
    const select = filters.status
        ? ADMIN_MESSAGE_COLUMNS.replace("notification_deliveries(", "notification_deliveries!inner(")
        : ADMIN_MESSAGE_COLUMNS;

    let query = supabaseAdmin
        .from("notification_messages")
        .select(select, { count: "exact" })
        .eq("users.role", "rider");

    if (filters.userId) query = query.eq("user_id", filters.userId);
    if (filters.status) query = query.eq("notification_deliveries.status", filters.status);
    if (filters.notificationType) query = query.eq("notification_type_code", filters.notificationType);

    const [from, to] = toRange(filters);
    query = query.order(filters.sortBy, { ascending: filters.sortDir === "asc" }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as RawMessageRow[];
    return paginate(
        rows.map((row) => ({
            ...toNotificationRow(row),
            rider: unwrap<{ id: string; full_name: string }>(row.users),
        })),
        count ?? 0,
        filters,
    );
}

/**
 * Sends a push to every targeted rider (explicit `user_ids`, or every active
 * rider when omitted). Per-recipient failures don't fail the broadcast.
 *
 * A broadcast is ONE event with many messages — which is what the three-table
 * split makes expressible, and is more honest than the old N unrelated rows
 * that happened to share a template string.
 */
export async function broadcastNotification(
    input: BroadcastInput,
    actor: AuthContext,
): Promise<BroadcastResult> {
    const targetIds = input.user_ids && input.user_ids.length > 0
        ? input.user_ids
        : await allActiveRiderIds();
    if (targetIds.length === 0) throw businessRule("No riders match the broadcast target.");

    const template = "admin_broadcast";

    const { data: event, error: eventError } = await supabaseAdmin
        .from("notification_events")
        .insert({
            notification_type_code: template,
            subject_type: "broadcast",
            subject_id: actor.id,
            payload: { screen: input.screen ?? null, title: input.title },
        })
        .select("id")
        .single();
    if (eventError) throw eventError;

    const { data: messages, error: messageError } = await supabaseAdmin
        .from("notification_messages")
        .insert(targetIds.map((userId) => ({
            notification_event_id: event.id,
            notification_type_code: template,
            user_id: userId,
            title: input.title,
            body: input.body,
        })))
        .select("id, user_id");
    if (messageError) throw messageError;

    const { data: deliveries, error: deliveryError } = await supabaseAdmin
        .from("notification_deliveries")
        .insert((messages ?? []).map((m) => ({
            notification_message_id: m.id, channel: "push" as const, status: "pending" as const,
        })))
        .select("id, notification_message_id");
    if (deliveryError) throw deliveryError;

    const deliveryByMessage = new Map(
        (deliveries ?? []).map((d) => [d.notification_message_id, d.id]),
    );

    const { data: devices, error: devicesError } = await supabaseAdmin
        .from("user_devices")
        .select("user_id, push_token")
        .in("user_id", targetIds)
        .is("revoked_at", null);
    if (devicesError) throw devicesError;

    const tokensByUser = new Map<string, string[]>();
    for (const d of devices ?? []) {
        tokensByUser.set(d.user_id, [...(tokensByUser.get(d.user_id) ?? []), d.push_token]);
    }

    let sent = 0;
    let failed = 0;
    await Promise.all((messages ?? []).map(async (message) => {
        const deliveryId = deliveryByMessage.get(message.id);
        const tokens = tokensByUser.get(message.user_id) ?? [];
        if (!deliveryId || tokens.length === 0) return; // No device — stays 'pending'.
        try {
            await Promise.all(tokens.map((token) => sendExpoPush(token, {
                title: input.title, body: input.body, data: { screen: input.screen },
            })));
            await supabaseAdmin
                .from("notification_deliveries")
                .update({ status: "sent", sent_at: new Date().toISOString() })
                .eq("id", deliveryId);
            sent += 1;
        } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            await supabaseAdmin
                .from("notification_deliveries")
                .update({ status: "failed", error: reason })
                .eq("id", deliveryId);
            failed += 1;
            console.error("[notifications] broadcast delivery failed", {
                userId: message.user_id, error: reason,
            });
        }
    }));

    const result: BroadcastResult = { template, targeted: targetIds.length, sent, failed };

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "notification.broadcast",
        entityType: "notification_broadcast",
        entityId: event.id,
        after: { title: input.title, ...result },
    });

    return result;
}

/** Role is a column now — one query where there were three tables. */
async function allActiveRiderIds(): Promise<string[]> {
    return activeIdsForRole("rider");
}

async function allActiveAdminIds(): Promise<string[]> {
    return activeIdsForRole("admin");
}

async function activeIdsForRole(role: "rider" | "staff" | "admin"): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("users")
        .select("id")
        .eq("role", role)
        .eq("status", "active")
        .is("deleted_at", null);
    if (error) throw error;
    return (data ?? []).map((r) => r.id);
}

/**
 * Notifies every active admin — for "staff needs to act" events. Same
 * best-effort contract as notifyUser. `excludeUserId` skips the admin who
 * caused the event themselves.
 */
export async function notifyAdmins(input: NotifyInput, excludeUserId?: string): Promise<void> {
    const adminIds = await allActiveAdminIds();
    await Promise.all(
        adminIds.filter((id) => id !== excludeUserId).map((id) => notifyUser(id, input)),
    );
}
