import { supabaseAdmin } from "../../config/supabase";
import { getVapidConfig } from "../../config/webPush";
import { serviceUnavailable } from "../../common/AppError";
import { sendWebPush, WebPushPayload } from "../../common/webPush";
import {
    SaveWebPushSubscriptionInput, WebPushConfigResponse, WebPushFanoutResult, WebPushSubscriptionRow,
} from "./web-push.types";

/**
 * Browser (Web Push) subscriptions for the rider web app.
 *
 * Mirrors registerPushToken in users.service.ts for the native app: one row
 * per browser, upserted on its globally unique endpoint, always bound to the
 * authenticated caller — the user id comes from the verified token, never
 * from the request body, so a rider cannot register a browser to someone
 * else's account.
 */

const SUBSCRIPTION_COLUMNS = "id, user_id, endpoint, p256dh, auth, failure_count";

/** Endpoints are capability URLs — log only which push service, never the URL. */
export function endpointHost(endpoint: string): string {
    try {
        return new URL(endpoint).host;
    } catch {
        return "invalid";
    }
}

export function getWebPushConfig(): WebPushConfigResponse {
    const vapid = getVapidConfig();
    return { enabled: vapid !== null, publicKey: vapid?.publicKey ?? null };
}

export async function saveSubscription(
    userId: string,
    input: SaveWebPushSubscriptionInput,
    userAgent?: string,
): Promise<void> {
    // Refusing up front beats storing a subscription nothing can send to: the
    // client only subscribes with a key from /config, which would be null.
    if (!getVapidConfig()) {
        throw serviceUnavailable("Browser notifications are not available right now.");
    }

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
        .from("web_push_subscriptions")
        .upsert(
            {
                user_id: userId,
                endpoint: input.endpoint,
                p256dh: input.keys.p256dh,
                auth: input.keys.auth,
                user_agent: userAgent ? userAgent.slice(0, 256) : null,
                expires_at: input.expirationTime ? new Date(input.expirationTime).toISOString() : null,
                last_seen_at: now,
                failure_count: 0,
                updated_at: now,
            },
            // On the endpoint, not (user_id, endpoint): the same browser
            // signing in as another rider re-points the row instead of
            // colliding, and a re-save after a key rotation refreshes keys.
            { onConflict: "endpoint" },
        );
    if (error) throw error;

    console.info("[web-push] subscription saved", { userId, pushService: endpointHost(input.endpoint) });
}

/**
 * Deletes the caller's subscription for this browser — on sign-out and when
 * the rider turns notifications off. Scoped to the caller's user id, so it
 * can never remove another rider's row; removing one that isn't there is a
 * successful no-op (the client may retry after a lost response).
 */
export async function removeSubscription(userId: string, endpoint: string): Promise<void> {
    const { error } = await supabaseAdmin
        .from("web_push_subscriptions")
        .delete()
        .eq("user_id", userId)
        .eq("endpoint", endpoint);
    if (error) throw error;
}

export async function listSubscriptions(userId: string): Promise<WebPushSubscriptionRow[]> {
    if (!getVapidConfig()) return [];
    const { data, error } = await supabaseAdmin
        .from("web_push_subscriptions")
        .select(SUBSCRIPTION_COLUMNS)
        .eq("user_id", userId);
    if (error) throw error;
    return (data ?? []) as WebPushSubscriptionRow[];
}

/** Several riders' subscriptions, keyed by user — for a broadcast fan-out. */
export async function listSubscriptionsByUser(
    userIds: string[],
): Promise<Map<string, WebPushSubscriptionRow[]>> {
    const byUser = new Map<string, WebPushSubscriptionRow[]>();
    if (userIds.length === 0 || !getVapidConfig()) return byUser;

    // Chunked: a broadcast can target thousands of riders, and an `in` list
    // that long overflows PostgREST's URL limit.
    const CHUNK = 200;
    for (let i = 0; i < userIds.length; i += CHUNK) {
        const { data, error } = await supabaseAdmin
            .from("web_push_subscriptions")
            .select(SUBSCRIPTION_COLUMNS)
            .in("user_id", userIds.slice(i, i + CHUNK));
        if (error) throw error;
        for (const row of (data ?? []) as WebPushSubscriptionRow[]) {
            byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);
        }
    }
    return byUser;
}

/**
 * Notification templates whose rider copy carries amounts, payment failure
 * reasons or dispute details. A browser notification is shown on a lock
 * screen or a shared desktop, so for these the push says only THAT something
 * happened; the full text stays in the signed-in inbox. Add a template here
 * whenever its body starts quoting money.
 */
const PRIVATE_BODY_TEMPLATES = new Set([
    "payment_success", "payment_failed", "booking_cancelled",
    "refund_initiated", "refund_completed", "refund_rejected",
    "damage_added", "damage_dispute_resolved", "adhoc_charge_added",
    "return_payment_required", "referral_reward_issued",
]);

export const PRIVATE_BODY_TEXT = "Open Swapngo to see the details.";

/**
 * The browser-facing copy for a notification. `tag` is the delivery id, so a
 * retried send replaces rather than duplicates (see WebPushPayload.tag).
 */
export function toWebPushPayload(
    input: { template: string; title: string; body: string; screen?: string },
    tag: string,
): WebPushPayload {
    // The ₹ check is the safety net for a template added without updating
    // the list above.
    const isPrivate = PRIVATE_BODY_TEMPLATES.has(input.template) || input.body.includes("₹");
    return {
        title: input.title,
        body: isPrivate ? PRIVATE_BODY_TEXT : input.body,
        screen: input.screen,
        tag,
    };
}

/**
 * Sends one payload to each subscription and keeps the table honest: dead
 * subscriptions (404/410) are deleted, live ones get last_success_at, and a
 * transient failure bumps failure_count. Never throws — the caller decides
 * what a failure means for its own delivery row.
 */
export async function sendToSubscriptions(
    subscriptions: WebPushSubscriptionRow[],
    payload: WebPushPayload,
    send: typeof sendWebPush = sendWebPush,
): Promise<WebPushFanoutResult> {
    const result: WebPushFanoutResult = { attempted: 0, delivered: 0, gone: 0, errors: [] };
    const vapid = getVapidConfig();
    if (!vapid || subscriptions.length === 0) return result;

    const deliveredIds: string[] = [];
    const goneIds: string[] = [];
    const failed: WebPushSubscriptionRow[] = [];

    await Promise.all(subscriptions.map(async (sub) => {
        result.attempted += 1;
        const outcome = await send(sub, payload, vapid);
        if (outcome.status === "delivered") {
            result.delivered += 1;
            deliveredIds.push(sub.id);
        } else if (outcome.status === "gone") {
            result.gone += 1;
            goneIds.push(sub.id);
            console.info("[web-push] subscription expired, removing", {
                userId: sub.user_id, pushService: endpointHost(sub.endpoint), statusCode: outcome.statusCode,
            });
        } else {
            failed.push(sub);
            result.errors.push(outcome.error);
            console.warn("[web-push] delivery failed", {
                userId: sub.user_id, pushService: endpointHost(sub.endpoint),
                statusCode: outcome.statusCode, error: outcome.error,
            });
        }
    }));

    // Bookkeeping is best-effort: a failed cleanup must not turn a delivered
    // notification into a reported failure.
    try {
        const now = new Date().toISOString();
        await Promise.all([
            goneIds.length
                ? supabaseAdmin.from("web_push_subscriptions").delete().in("id", goneIds)
                : null,
            deliveredIds.length
                ? supabaseAdmin.from("web_push_subscriptions")
                    .update({ last_success_at: now, failure_count: 0 })
                    .in("id", deliveredIds)
                : null,
            ...failed.map((sub) => supabaseAdmin.from("web_push_subscriptions")
                .update({ failure_count: sub.failure_count + 1, updated_at: now })
                .eq("id", sub.id)),
        ]);
    } catch (err) {
        console.error("[web-push] subscription bookkeeping failed", {
            error: err instanceof Error ? err.message : String(err),
        });
    }

    return result;
}
