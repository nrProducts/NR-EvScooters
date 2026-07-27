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

const ROW_COLUMNS = "id, user_id, channel, template, payload, status, sent_at, read_at, created_at";
const ADMIN_ROW_COLUMNS = `${ROW_COLUMNS}, users(id, full_name)`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/**
 * The one function every module calls to notify a rider. Persists first —
 * the log row is the source of truth — then best-effort attempts push
 * delivery. Never throws: a notification failure must not roll back the
 * business action that triggered it (same contract as writeAudit).
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
    const payload = { title: input.title, body: input.body, screen: input.screen };

    const { data: row, error: insertError } = await supabaseAdmin
        .from("notifications_log")
        .insert({
            user_id: userId,
            channel: "push",
            template: input.template,
            payload,
            status: "pending",
        })
        .select("id")
        .single();

    if (insertError || !row) {
        console.error("[notifications] failed to record notification", {
            userId,
            template: input.template,
            error: insertError?.message,
        });
        return;
    }

    const { data: user, error: userError } = await supabaseAdmin
        .from("users")
        .select("push_token")
        .eq("id", userId)
        .maybeSingle();

    if (userError || !user?.push_token) return; // no token yet — row stays 'pending'

    try {
        await sendExpoPush(user.push_token, { title: input.title, body: input.body, data: { screen: input.screen } });
        await supabaseAdmin
            .from("notifications_log")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", row.id);
    } catch (err) {
        console.error("[notifications] push delivery failed", {
            userId,
            template: input.template,
            error: err instanceof Error ? err.message : err,
        });
        await supabaseAdmin.from("notifications_log").update({ status: "failed" }).eq("id", row.id);
    }
}

export async function listMyNotifications(
    userId: string,
    filters: ListNotificationsFilters,
): Promise<Paginated<NotificationRow>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("notifications_log")
        .select(ROW_COLUMNS, { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);

    if (error) throw error;
    return paginate((data ?? []) as unknown as NotificationRow[], count ?? 0, filters);
}

export async function unreadCount(userId: string): Promise<{ count: number }> {
    const { count, error } = await supabaseAdmin
        .from("notifications_log")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);

    if (error) throw error;
    return { count: count ?? 0 };
}

export async function markRead(userId: string, id: string): Promise<NotificationRow> {
    const { data, error } = await supabaseAdmin
        .from("notifications_log")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId)
        .select(ROW_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw notFound("Notification not found.");
    return data as unknown as NotificationRow;
}

export async function markAllRead(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("notifications_log")
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
    let query = supabaseAdmin.from("notifications_log").select(ADMIN_ROW_COLUMNS, { count: "exact" });

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.userId) query = query.eq("user_id", filters.userId);

    const [from, to] = toRange(filters);
    query = query.order("created_at", { ascending: false }).range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    const rows = (data ?? []) as unknown as Array<NotificationRow & { users: unknown }>;
    return paginate(
        rows.map((row) => ({ ...row, rider: unwrap<{ id: string; full_name: string }>(row.users) })),
        count ?? 0,
        filters,
    );
}

/**
 * Sends a push notification to every targeted rider (explicit `user_ids`, or
 * every active rider when omitted). SMS/email broadcast isn't wired up —
 * `notification_channel` has those values in the DB, but only push actually
 * has a delivery path today (see common/push.ts); MSG91 is OTP-only.
 * Per-recipient delivery failures don't fail the whole broadcast — same
 * best-effort contract as notifyUser.
 */
export async function broadcastNotification(
    input: BroadcastInput,
    actor: AuthContext,
): Promise<BroadcastResult> {
    const targetIds = input.user_ids && input.user_ids.length > 0 ? input.user_ids : await allActiveRiderIds();
    if (targetIds.length === 0) throw businessRule("No riders match the broadcast target.");

    const template = "admin_broadcast";
    const payload = { title: input.title, body: input.body, screen: input.screen };

    const { data: rows, error: insertError } = await supabaseAdmin
        .from("notifications_log")
        .insert(targetIds.map((userId) => ({
            user_id: userId, channel: "push" as const, template, payload, status: "pending" as const,
        })))
        .select("id, user_id");
    if (insertError) throw insertError;

    const { data: users, error: usersError } = await supabaseAdmin
        .from("users")
        .select("id, push_token")
        .in("id", targetIds);
    if (usersError) throw usersError;
    const tokenByUser = new Map((users ?? []).map((u) => [u.id as string, u.push_token as string | null]));

    let sent = 0;
    let failed = 0;
    await Promise.all(
        ((rows ?? []) as Array<{ id: string; user_id: string }>).map(async (row) => {
            const token = tokenByUser.get(row.user_id);
            if (!token) return; // no device registered yet — row stays 'pending'
            try {
                await sendExpoPush(token, { title: input.title, body: input.body, data: { screen: input.screen } });
                await supabaseAdmin
                    .from("notifications_log")
                    .update({ status: "sent", sent_at: new Date().toISOString() })
                    .eq("id", row.id);
                sent += 1;
            } catch (err) {
                await supabaseAdmin.from("notifications_log").update({ status: "failed" }).eq("id", row.id);
                failed += 1;
                console.error("[notifications] broadcast delivery failed", {
                    userId: row.user_id,
                    error: err instanceof Error ? err.message : err,
                });
            }
        }),
    );

    const result: BroadcastResult = { template, targeted: targetIds.length, sent, failed };

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "notification.broadcast",
        entityType: "notification_broadcast",
        entityId: template,
        after: { title: input.title, ...result },
    });

    return result;
}

async function allActiveRiderIds(): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, roles!inner(name), users!inner(deleted_at, account_status)")
        .eq("roles.name", "rider")
        .is("users.deleted_at", null)
        .eq("users.account_status", "active");
    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.user_id as string))];
}
