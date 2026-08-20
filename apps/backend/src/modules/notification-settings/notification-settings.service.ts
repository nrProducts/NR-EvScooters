import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext, NotificationTypeCode } from "../../types";
import {
    EligibleRecipient, NotificationSettingRow, NotificationTypeSummary, RecipientResolution,
    UpdateNotificationSettingInput,
} from "./notification-settings.types";

/**
 * Notification configuration.
 *
 * `notification_settings` (a row per event type) and `notification_recipients`
 * (who hears about it) became `notification_types` and
 * `notification_subscribers`. That is more than a rename in two ways:
 *
 *   The type catalogue is DATA, not an enum. A new event type is a row, not a
 *   migration plus a deploy — which is why `NOTIFICATION_TYPES` no longer
 *   exists as a constant and the display order comes from the table.
 *
 *   `notification_types` also carries `requires_action` and `action_path`,
 *   which is what lets the console decide whether a notification is a task or
 *   just news. The front end had a hard-coded `APPROVAL_TEMPLATES` map doing
 *   that job; Stage 10 deletes it in favour of this.
 */

const TYPE_COLUMNS = `
    code, label, description, is_enabled, send_email, send_in_app, send_push,
    requires_action, action_path, default_audience, updated_at,
    notification_subscribers(user_id, users(full_name))
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawTypeRow {
    code: string;
    label: string;
    is_enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    send_push: boolean;
    requires_action: boolean;
    action_path: string | null;
    updated_at: string | null;
    notification_subscribers: unknown;
}

function toSettingRow(row: RawTypeRow): NotificationSettingRow {
    const recipients = (Array.isArray(row.notification_subscribers) ? row.notification_subscribers : [])
        .map((r) => {
            const user = unwrap<{ full_name: string }>((r as { users: unknown }).users);
            return user ? { user_id: (r as { user_id: string }).user_id, full_name: user.full_name } : null;
        })
        .filter((r): r is { user_id: string; full_name: string } => r !== null);

    return {
        // The type's code IS its identity now — there is no surrogate key,
        // which is why every write below is keyed on it.
        id: row.code,
        notification_type: row.code,
        label: row.label,
        enabled: row.is_enabled,
        send_email: row.send_email,
        send_in_app: row.send_in_app,
        requires_action: row.requires_action,
        action_path: row.action_path,
        updated_at: row.updated_at,
        recipients,
    };
}

/** Every event type with its current config, in the catalogue's own order. */
export async function listSettings(): Promise<NotificationSettingRow[]> {
    const { data, error } = await supabaseAdmin
        .from("notification_types")
        .select(TYPE_COLUMNS)
        .order("code");
    if (error) throw error;
    return ((data ?? []) as unknown as RawTypeRow[]).map(toSettingRow);
}

/**
 * The catalogue alone — no subscriber lists, no channel config.
 *
 * Exists so a staff account can interpret a notification without being able
 * to read who else is notified. The admin console's realtime layer needs
 * `requires_action` / `action_path` to decide whether an incoming message is
 * a task or just news; before this it read the full admin-only settings
 * endpoint, so a staff session got a 403 and every actionable notification
 * silently degraded to a bell tick.
 *
 * See docs/final-system-audit (finding M2).
 */
export async function listTypeSummaries(): Promise<NotificationTypeSummary[]> {
    const { data, error } = await supabaseAdmin
        .from("notification_types")
        .select("code, label, requires_action, action_path")
        .eq("is_enabled", true)
        .order("code");
    if (error) throw error;

    return (data ?? []).map((row) => ({
        notification_type: row.code,
        label: row.label,
        requires_action: row.requires_action,
        action_path: row.action_path,
    }));
}

/**
 * Updates one event type's config and diffs its subscriber list — deletes
 * only the rows no longer selected, inserts only the newly-added ones, rather
 * than delete-all-then-reinsert, so a partial failure never leaves a type
 * with zero recipients.
 */
export async function updateSetting(
    type: NotificationTypeCode,
    input: UpdateNotificationSettingInput,
    actor: AuthContext,
    req?: Request,
): Promise<NotificationSettingRow> {
    const { data: existingType, error: updateError } = await supabaseAdmin
        .from("notification_types")
        .update({
            is_enabled: input.enabled,
            send_email: input.send_email,
            send_in_app: input.send_in_app,
        })
        .eq("code", type)
        .select("code")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!existingType) throw notFound("Unknown notification type.");

    const { data: existing, error: existingError } = await supabaseAdmin
        .from("notification_subscribers")
        .select("user_id")
        .eq("notification_type_code", type);
    if (existingError) throw existingError;

    const existingIds = new Set((existing ?? []).map((r) => r.user_id));
    const nextIds = new Set(input.recipient_user_ids);

    const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
    const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
        const { error } = await supabaseAdmin
            .from("notification_subscribers")
            .delete()
            .eq("notification_type_code", type)
            .in("user_id", toRemove);
        if (error) throw error;
    }
    if (toAdd.length > 0) {
        const { error } = await supabaseAdmin
            .from("notification_subscribers")
            .insert(toAdd.map((userId) => ({ notification_type_code: type, user_id: userId })));
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "notification_setting.updated",
        entityType: "notification_setting",
        entityId: type,
        after: {
            notification_type: type, enabled: input.enabled, send_email: input.send_email,
            send_in_app: input.send_in_app, recipient_count: nextIds.size,
        },
        req,
    });

    const rows = await listSettings();
    const updated = rows.find((r) => r.notification_type === type);
    if (!updated) throw notFound("Unknown notification type.");
    return updated;
}

/**
 * What notify() needs to act on one event: whether to deliver at all, through
 * which channel(s), and to whom — filtered to accounts still active and not
 * soft-deleted. A staff member deactivated after being configured simply
 * stops appearing, with no cleanup needed.
 */
export async function getRecipients(type: NotificationTypeCode): Promise<RecipientResolution> {
    const { data: notificationType, error } = await supabaseAdmin
        .from("notification_types")
        .select("code, is_enabled, send_email, send_in_app")
        .eq("code", type)
        .maybeSingle();
    if (error) throw error;
    if (!notificationType?.is_enabled
        || (!notificationType.send_email && !notificationType.send_in_app)) {
        return { sendEmail: false, sendInApp: false, recipients: [] };
    }

    const { data, error: recipientsError } = await supabaseAdmin
        .from("notification_subscribers")
        .select("users(id, full_name, email, status, deleted_at)")
        .eq("notification_type_code", type);
    if (recipientsError) throw recipientsError;

    const recipients = ((data ?? []) as Array<{ users: unknown }>)
        .map((row) => unwrap<{
            id: string; full_name: string; email: string | null;
            status: string; deleted_at: string | null;
        }>(row.users))
        .filter((u): u is NonNullable<typeof u> => u !== null && u.deleted_at === null && u.status === "active")
        .map((u): EligibleRecipient => ({ id: u.id, full_name: u.full_name, email: u.email }));

    return {
        sendEmail: notificationType.send_email,
        sendInApp: notificationType.send_in_app,
        recipients,
    };
}
