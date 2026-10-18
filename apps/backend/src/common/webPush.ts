import webpush, { PushSubscription, RequestOptions, SendResult, WebPushError } from "web-push";
import type { VapidConfig } from "../config/webPush";

/**
 * What the rider web app's service worker receives (apps/mobile/public/sw.js
 * reads exactly these keys). JSON-encoded, then encrypted to the browser's
 * keys by web-push — the push service only ever sees ciphertext.
 */
export interface WebPushPayload {
    title: string;
    body: string;
    /** A RiderAppScreen; the service worker resolves it through its allowlist. */
    screen?: string;
    /**
     * Notification tag — the browser REPLACES a shown notification that has
     * the same tag instead of stacking a second one. Set to the notification
     * message id so a retried delivery can never show twice.
     */
    tag?: string;
}

export interface WebPushTarget {
    endpoint: string;
    p256dh: string;
    auth: string;
}

/**
 * delivered — the push service accepted it (201).
 * gone      — 404/410: the subscription is permanently dead and must be
 *             deleted. This is the ONLY outcome that justifies deleting;
 *             anything else may be ours or transient.
 * failed    — anything else (5xx, 429, network, a 400/403 that points at our
 *             own payload or keys rather than at the subscription).
 */
export type WebPushOutcome =
    | { status: "delivered" }
    | { status: "gone"; statusCode: number }
    | { status: "failed"; statusCode?: number; error: string };

type SendFn = (
    subscription: PushSubscription,
    payload: string,
    options: RequestOptions,
) => Promise<SendResult>;

const defaultSend: SendFn = (subscription, payload, options) =>
    webpush.sendNotification(subscription, payload, options);

/**
 * A day. A "your scooter is assigned" push that reaches a laptop opened two
 * days later is noise, and push services hold undelivered messages for up to
 * the TTL — FCM's own default is four weeks.
 */
const TTL_SECONDS = 24 * 60 * 60;

/**
 * Topic header: ≤32 chars from the URL-safe base64 alphabet. A uuid minus its
 * dashes is exactly 32 — dashes are legal but must go, or the cut at 32
 * drops the uuid's tail and two ids can collide.
 */
function toTopic(tag: string | undefined): string | undefined {
    if (!tag) return undefined;
    const topic = tag.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    return topic || undefined;
}

/**
 * Dumb transport only — no DB writes here, that's web-push.service.ts's job.
 * Never throws: every outcome is returned, so one dead browser cannot abort a
 * fan-out to the rider's others. `sendFn` defaults to the real web-push call
 * but is injectable for tests, same pattern as sendExpoPush in push.ts.
 */
export async function sendWebPush(
    target: WebPushTarget,
    payload: WebPushPayload,
    vapid: VapidConfig,
    sendFn: SendFn = defaultSend,
): Promise<WebPushOutcome> {
    const topic = toTopic(payload.tag);
    try {
        await sendFn(
            { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
            JSON.stringify(payload),
            {
                vapidDetails: vapid,
                TTL: TTL_SECONDS,
                // Ride events are time-sensitive; "high" lets a phone in
                // battery saver wake for them.
                urgency: "high",
                // Topic collapses a still-undelivered message with the same
                // id at the push service — the server-side half of the dedupe
                // that `tag` does in the browser.
                ...(topic ? { topic } : {}),
                timeout: 10_000,
            },
        );
        return { status: "delivered" };
    } catch (err) {
        const statusCode = err instanceof WebPushError ? err.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) return { status: "gone", statusCode };
        const error = err instanceof WebPushError
            ? `${err.statusCode} ${err.body || err.message}`.trim()
            : err instanceof Error ? err.message : String(err);
        return { status: "failed", statusCode, error };
    }
}
