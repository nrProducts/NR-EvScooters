/**
 * Web Push — browser notifications for the rider web app (apps/mobile
 * exported to web). The native app keeps using Expo push via user_devices;
 * this is the browser's equivalent, stored in web_push_subscriptions.
 */

/** GET /users/me/web-push/config */
export interface WebPushConfigResponse {
    /** False when the server has no VAPID key pair — the app hides the prompt. */
    enabled: boolean;
    /** VAPID public key (base64url) for PushManager.subscribe. Null when disabled. */
    publicKey: string | null;
}

/**
 * POST /users/me/web-push/subscriptions — exactly PushSubscription.toJSON().
 * The user agent is read from the request header, not the body.
 */
export interface SaveWebPushSubscriptionInput {
    endpoint: string;
    expirationTime?: number | null;
    keys: { p256dh: string; auth: string };
}

/** DELETE /users/me/web-push/subscriptions */
export interface RemoveWebPushSubscriptionInput {
    endpoint: string;
}

/** The columns the send path needs. */
export interface WebPushSubscriptionRow {
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    failure_count: number;
}

export interface WebPushFanoutResult {
    /** Subscriptions a send was attempted to. */
    attempted: number;
    delivered: number;
    /** Reported dead (404/410) and deleted. */
    gone: number;
    /** One message per failed (not gone) subscription. */
    errors: string[];
}
