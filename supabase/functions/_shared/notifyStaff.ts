// =========================================================================
// _shared/notifyStaff — admin/staff fan-out, for scheduled functions
//
// notifyUser() in ./notify.ts addresses exactly one rider. No edge function
// has needed multi-recipient staff fan-out before this one, so this mirrors
// notify() in apps/backend/src/modules/notifications/notify.service.ts
// (recipients come from notification_subscribers, gated by
// notification_types.is_enabled/send_in_app) rather than importing it —
// Edge Functions run on Deno and cannot reach the Node backend's modules,
// the same constraint ./notify.ts's own header comment already notes.
//
// One event, one message per recipient, one delivery per message —
// same three-table shape as notifyUser(), just fanned out.
// =========================================================================

import type { Admin } from "./client.ts";
import { deliverPush } from "./notify.ts";

export interface NotifyStaffInput {
    /** Must exist in `notification_types.code`. */
    typeCode: string;
    subjectType: string;
    subjectId: string;
    title: string;
    body: string;
    screen?: string;
    payload?: Record<string, unknown>;
}

function unwrap<T>(raw: unknown): T | null {
    const v = Array.isArray(raw) ? raw[0] : raw;
    return (v as T) ?? null;
}

/**
 * Notifies every admin/staff subscriber configured for this notification
 * type. Never throws — a scheduled sweep's job is the business change it
 * just made; a notification that fails to fan out must not fail the run.
 */
export async function notifyStaff(admin: Admin, input: NotifyStaffInput): Promise<{ notified: number }> {
    try {
        const { data: type, error: typeError } = await admin
            .from("notification_types")
            .select("is_enabled, send_in_app")
            .eq("code", input.typeCode)
            .maybeSingle();
        if (typeError || !type?.is_enabled || !type.send_in_app) return { notified: 0 };

        const { data: subs, error: subsError } = await admin
            .from("notification_subscribers")
            .select("users(id, status, deleted_at)")
            .eq("notification_type_code", input.typeCode);
        if (subsError) throw subsError;

        const recipients = (subs ?? [])
            .map((s: { users: unknown }) => unwrap<{ id: string; status: string; deleted_at: string | null }>(s.users))
            .filter((u): u is { id: string; status: string; deleted_at: string | null } =>
                !!u && u.status === "active" && !u.deleted_at);
        if (recipients.length === 0) return { notified: 0 };

        const { data: event, error: eventError } = await admin
            .from("notification_events")
            .insert({
                notification_type_code: input.typeCode,
                subject_type: input.subjectType,
                subject_id: input.subjectId,
                payload: { screen: input.screen ?? null, ...(input.payload ?? {}) },
            })
            .select("id")
            .single();
        if (eventError) throw eventError;

        let notified = 0;
        for (const recipient of recipients) {
            const { data: message, error: messageError } = await admin
                .from("notification_messages")
                .insert({
                    notification_event_id: event.id,
                    notification_type_code: input.typeCode,
                    user_id: recipient.id,
                    title: input.title,
                    body: input.body,
                })
                .select("id")
                .maybeSingle();
            if (messageError || !message) continue;

            const { data: delivery, error: deliveryError } = await admin
                .from("notification_deliveries")
                .insert({
                    notification_message_id: message.id,
                    channel: "push",
                    status: "pending",
                    provider: "expo",
                })
                .select("id")
                .maybeSingle();
            if (deliveryError || !delivery) continue;

            await deliverPush(admin, delivery.id, recipient.id, {
                typeCode: input.typeCode,
                subjectType: input.subjectType,
                subjectId: input.subjectId,
                title: input.title,
                body: input.body,
                screen: input.screen,
            });
            notified++;
        }
        return { notified };
    } catch (err) {
        console.error("[notifyStaff] could not fan out notification", {
            typeCode: input.typeCode,
            error: err instanceof Error ? err.message : String(err),
        });
        return { notified: 0 };
    }
}
