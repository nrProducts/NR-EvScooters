import type { Request } from "express";
import { supabaseAdmin } from "../../config/supabase";
import { notFound } from "../../common/AppError";
import { writeAudit } from "../../common/audit";
import { AuthContext, NotificationType, NOTIFICATION_TYPES } from "../../types";
import {
    EligibleRecipient, NotificationSettingRow, RecipientResolution, UpdateNotificationSettingInput,
} from "./notification-settings.types";

const SETTING_COLUMNS = `
    id, notification_type, enabled, send_email, send_in_app, updated_at,
    notification_recipients(user_id, users(full_name))
`;

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

interface RawSettingRow {
    id: string;
    notification_type: NotificationType;
    enabled: boolean;
    send_email: boolean;
    send_in_app: boolean;
    updated_at: string | null;
    notification_recipients: unknown;
}

function toSettingRow(row: RawSettingRow): NotificationSettingRow {
    const recipients = (Array.isArray(row.notification_recipients) ? row.notification_recipients : [])
        .map((r) => {
            const user = unwrap<{ full_name: string }>((r as { users: unknown }).users);
            return user ? { user_id: (r as { user_id: string }).user_id, full_name: user.full_name } : null;
        })
        .filter((r): r is { user_id: string; full_name: string } => r !== null);

    return {
        id: row.id,
        notification_type: row.notification_type,
        enabled: row.enabled,
        send_email: row.send_email,
        send_in_app: row.send_in_app,
        updated_at: row.updated_at,
        recipients,
    };
}

/** All 7 event types with their current config — the seed migration guarantees exactly one row per type. */
export async function listSettings(): Promise<NotificationSettingRow[]> {
    const { data, error } = await supabaseAdmin.from("notification_settings").select(SETTING_COLUMNS);
    if (error) throw error;

    const rows = ((data ?? []) as unknown as RawSettingRow[]).map(toSettingRow);
    // Fixed display order — not enum insertion order, which Postgres doesn't guarantee to preserve.
    return NOTIFICATION_TYPES
        .map((type) => rows.find((r) => r.notification_type === type))
        .filter((r): r is NotificationSettingRow => r !== undefined);
}

/**
 * Updates one event type's config and diffs its recipient list — deletes
 * only the rows no longer selected, inserts only the newly-added ones,
 * rather than delete-all-then-reinsert, so a partial failure never leaves a
 * type with zero recipients.
 */
export async function updateSetting(
    type: NotificationType,
    input: UpdateNotificationSettingInput,
    actor: AuthContext,
    req?: Request,
): Promise<NotificationSettingRow> {
    const { data: setting, error: updateError } = await supabaseAdmin
        .from("notification_settings")
        .update({ enabled: input.enabled, send_email: input.send_email, send_in_app: input.send_in_app })
        .eq("notification_type", type)
        .select("id")
        .maybeSingle();
    if (updateError) throw updateError;
    if (!setting) throw notFound("Unknown notification type.");

    const { data: existing, error: existingError } = await supabaseAdmin
        .from("notification_recipients")
        .select("user_id")
        .eq("notification_setting_id", setting.id);
    if (existingError) throw existingError;

    const existingIds = new Set((existing ?? []).map((r) => r.user_id as string));
    const nextIds = new Set(input.recipient_user_ids);

    const toRemove = [...existingIds].filter((id) => !nextIds.has(id));
    const toAdd = [...nextIds].filter((id) => !existingIds.has(id));

    if (toRemove.length > 0) {
        const { error } = await supabaseAdmin
            .from("notification_recipients")
            .delete()
            .eq("notification_setting_id", setting.id)
            .in("user_id", toRemove);
        if (error) throw error;
    }
    if (toAdd.length > 0) {
        const { error } = await supabaseAdmin
            .from("notification_recipients")
            .insert(toAdd.map((userId) => ({ notification_setting_id: setting.id, user_id: userId })));
        if (error) throw error;
    }

    await writeAudit({
        actorId: actor.id,
        targetUserId: null,
        action: "notification_setting.updated",
        entityType: "notification_setting",
        entityId: setting.id,
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
 * What notify.service.ts's notify() needs to act on one event: whether
 * anything should be delivered at all, through which channel(s), and to
 * whom — filtered to accounts that are still active and not soft-deleted
 * (same filter allActiveAdminIds() already applies, here scoped to the
 * explicit configured list instead of "every admin"). A staff member who's
 * deactivated or deleted after being configured as a recipient simply stops
 * appearing here — no separate cleanup needed.
 */
export async function getRecipients(type: NotificationType): Promise<RecipientResolution> {
    const { data: setting, error } = await supabaseAdmin
        .from("notification_settings")
        .select("id, enabled, send_email, send_in_app")
        .eq("notification_type", type)
        .maybeSingle();
    if (error) throw error;
    if (!setting || !setting.enabled || (!setting.send_email && !setting.send_in_app)) {
        return { sendEmail: false, sendInApp: false, recipients: [] };
    }

    const { data, error: recipientsError } = await supabaseAdmin
        .from("notification_recipients")
        .select("users(id, full_name, email, account_status, deleted_at)")
        .eq("notification_setting_id", setting.id);
    if (recipientsError) throw recipientsError;

    const recipients = ((data ?? []) as Array<{ users: unknown }>)
        .map((row) => unwrap<{ id: string; full_name: string; email: string | null; account_status: string; deleted_at: string | null }>(row.users))
        .filter((u): u is NonNullable<typeof u> => u !== null && u.deleted_at === null && u.account_status === "active")
        .map((u): EligibleRecipient => ({ id: u.id, full_name: u.full_name, email: u.email }));

    return { sendEmail: setting.send_email, sendInApp: setting.send_in_app, recipients };
}
