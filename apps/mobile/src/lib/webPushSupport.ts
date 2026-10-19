/**
 * The pure half of lib/webPush.ts — no React Native, no browser globals
 * beyond `atob`, so the rules can be unit-tested in Node.
 */

export type WebPushSupport = 'supported' | 'unsupported' | 'insecure' | 'ios-install-required';

/** The browser facts support depends on, read by lib/webPush.ts. */
export interface BrowserEnv {
    isSecureContext: boolean;
    hasServiceWorker: boolean;
    hasPushManager: boolean;
    hasNotification: boolean;
    userAgent: string;
    maxTouchPoints: number;
    /** Running as an installed Home Screen / standalone app. */
    standalone: boolean;
}

/** iPhone, iPod, and iPadOS 13+ (which reports itself as a Mac with touch). */
export function isIosLike(env: Pick<BrowserEnv, 'userAgent' | 'maxTouchPoints'>): boolean {
    return /iPad|iPhone|iPod/.test(env.userAgent)
        || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
}

/**
 * iOS/iPadOS only allow Web Push (16.4+) to a site ADDED TO THE HOME SCREEN
 * and opened from there; in a Safari tab PushManager simply does not exist.
 * That case gets its own state so the rider is told how to fix it, rather
 * than "your browser does not support this".
 */
export function detectWebPushSupport(env: BrowserEnv): WebPushSupport {
    if (!env.isSecureContext) return 'insecure';
    if (isIosLike(env) && !env.standalone) return 'ios-install-required';
    if (!env.hasServiceWorker || !env.hasPushManager || !env.hasNotification) return 'unsupported';
    return 'supported';
}

/** The VAPID public key (base64url) as PushManager.subscribe wants it. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

/**
 * Was this subscription created with the server's CURRENT key? After a VAPID
 * key rotation every old subscription is unusable (the push service rejects
 * our signature), so it has to be replaced rather than re-saved.
 */
export function subscriptionKeyMatches(
    applicationServerKey: ArrayBuffer | null | undefined,
    publicKey: string,
): boolean {
    if (!applicationServerKey) return false;
    const current = new Uint8Array(applicationServerKey);
    const expected = urlBase64ToUint8Array(publicKey);
    return current.length === expected.length && current.every((b, i) => b === expected[i]);
}

/** Which riders have opted in, from the stored JSON. Tolerates garbage. */
export function parseEnabledUsers(raw: string | null): string[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
        return [];
    }
}
