import { env } from "./env";

/**
 * VAPID configuration for Web Push (RFC 8292).
 *
 * Same contract as config/razorpay.ts and config/resend.ts: the server boots
 * without it, and the feature reports itself unavailable instead of crashing.
 * Unlike Razorpay this is not mandatory in production — a missing key pair
 * costs riders browser notifications, not money.
 */
export interface VapidConfig {
    publicKey: string;
    privateKey: string;
    subject: string;
}

/** The key pair, or null when either half is missing or the subject is unusable. */
export function getVapidConfig(): VapidConfig | null {
    const { vapidPublicKey: publicKey, vapidPrivateKey: privateKey, vapidSubject: subject } = env;
    if (!publicKey || !privateKey) return null;
    // web-push throws on anything else, and it would throw on EVERY send.
    if (!/^(mailto:|https:\/\/)/.test(subject)) {
        console.error("[web-push] VAPID_SUBJECT must be a mailto: or https: URL; web push disabled");
        return null;
    }
    return { publicKey, privateKey, subject };
}

export const isWebPushConfigured = (): boolean => getVapidConfig() !== null;
