// =========================================================================
// _shared/notify — the rider notification path, three tables deep
//
// `notifications_log` is gone. One row that was simultaneously the event,
// the addressed message and the delivery attempt is now three:
//
//   notification_events      what happened, once, whoever it concerns
//   notification_messages    the copy addressed to one person — the inbox
//   notification_deliveries  one row per channel, with its own status
//
// This mirrors notifyUser() in
// apps/backend/src/modules/notifications/notifications.service.ts. It is
// re-implemented rather than imported because Edge Functions run on Deno and
// cannot reach the Node backend's modules.
//
// Two behaviours worth keeping in mind:
//
//   * `notification_type_code` is FK'd to `notification_types.code`. A code
//     that is not seeded does not degrade — the insert fails and the rider
//     gets nothing. Migration 30 seeds every code these functions emit.
//   * Persist first, deliver second. The message is the source of truth; a
//     push that never sends leaves its delivery row 'pending' or 'failed'
//     and the rider still sees the message in the app.
// =========================================================================

import type { Admin } from "./client.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export interface NotifyInput {
    /** Must exist in `notification_types.code`. */
    typeCode: string;
    /** What the event is about, e.g. "booking", "subscription_period". */
    subjectType: string;
    subjectId: string;
    title: string;
    body: string;
    /** Mobile route the notification opens. */
    screen?: string;
    /** Extra context recorded on the event. */
    payload?: Record<string, unknown>;
}

/**
 * Records a notification for one rider and attempts to push it.
 *
 * Never throws: a scheduled sweep's job is the business change it just made,
 * and failing the whole run because a push did not go out would leave the
 * remaining candidates unprocessed. Returns whether a push actually landed,
 * which is only used for the run's summary counters.
 */
export async function notifyUser(
    admin: Admin,
    userId: string,
    input: NotifyInput,
): Promise<{ logged: boolean; sent: boolean }> {
    try {
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

        const { data: message, error: messageError } = await admin
            .from("notification_messages")
            .insert({
                notification_event_id: event.id,
                notification_type_code: input.typeCode,
                user_id: userId,
                title: input.title,
                body: input.body,
            })
            .select("id")
            .single();
        if (messageError) throw messageError;

        const { data: delivery, error: deliveryError } = await admin
            .from("notification_deliveries")
            .insert({
                notification_message_id: message.id,
                channel: "push",
                status: "pending",
                provider: "expo",
            })
            .select("id")
            .single();
        if (deliveryError) throw deliveryError;

        const sent = await deliverPush(admin, delivery.id, userId, input);
        return { logged: true, sent };
    } catch (err) {
        console.error("[notify] could not record notification", {
            userId,
            typeCode: input.typeCode,
            error: err instanceof Error ? err.message : String(err),
        });
        return { logged: false, sent: false };
    }
}

/**
 * Sends to every live device the rider has.
 *
 * The push token moved from `users.push_token` to `user_devices`, which
 * changes the shape of this: a rider with a phone and a tablet has two
 * tokens, and a signed-out device has a `revoked_at`. A rider with no live
 * device is not a failure — the delivery stays 'pending' and the message is
 * waiting in the app when they next open it.
 */
export async function deliverPush(
    admin: Admin,
    deliveryId: string,
    userId: string,
    input: NotifyInput,
): Promise<boolean> {
    const { data: devices, error } = await admin
        .from("user_devices")
        .select("push_token")
        .eq("user_id", userId)
        .is("revoked_at", null);

    const tokens = (devices ?? [])
        .map((d: { push_token: string | null }) => d.push_token)
        .filter((t: string | null): t is string => !!t);
    if (error || tokens.length === 0) return false;

    try {
        const results = await Promise.all(tokens.map((token) => sendOne(token, input)));
        const ok = results.some(Boolean);
        await admin
            .from("notification_deliveries")
            .update(
                ok
                    ? { status: "sent", sent_at: new Date().toISOString() }
                    : { status: "failed", error: "Expo rejected every device token." },
            )
            .eq("id", deliveryId);
        return ok;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[notify] push delivery failed", { userId, error: message });
        await admin
            .from("notification_deliveries")
            .update({ status: "failed", error: message })
            .eq("id", deliveryId);
        return false;
    }
}

async function sendOne(token: string, input: NotifyInput): Promise<boolean> {
    const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
            to: token,
            title: input.title,
            body: input.body,
            sound: "default",
            data: { screen: input.screen },
        }),
    });
    const result = await res.json().catch(() => null);
    return res.ok && result?.data?.status !== "error";
}
