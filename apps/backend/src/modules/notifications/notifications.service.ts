import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { sendExpoPush } from "../../common/push";
import { Paginated } from "../../types";
import { ListNotificationsFilters, NotificationRow, NotifyInput } from "./notifications.types";

const ROW_COLUMNS = "id, user_id, channel, template, payload, status, sent_at, read_at, created_at";

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
