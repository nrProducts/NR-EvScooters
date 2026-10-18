import { Platform } from 'react-native';
import { api } from './api';
import {
    detectWebPushSupport, parseEnabledUsers, subscriptionKeyMatches, urlBase64ToUint8Array,
    type BrowserEnv, type WebPushSupport,
} from './webPushSupport';

export type { WebPushSupport } from './webPushSupport';

/**
 * Web Push for the rider WEB app (this codebase exported to static web).
 *
 * The native app gets push through expo-notifications + Expo's push service
 * (lib/pushNotifications.ts). A browser has neither, so on web the app uses
 * the standard stack instead: a service worker (public/sw.js) receives pushes
 * from the browser vendor's push service, which the backend reaches with our
 * VAPID key (apps/backend/src/common/webPush.ts). That is what lets a
 * notification arrive with no Swapngo tab open.
 *
 * Every export is safe to call on native and during static rendering — each
 * one checks for a real browser first and does nothing otherwise.
 *
 * Permission is NEVER requested here except from enableWebPush(), which the
 * UI calls only from the rider's own tap on "Enable notifications".
 */

const SW_URL = '/sw.js';
/**
 * Riders who turned notifications on IN THIS BROWSER. Browser permission is
 * per-site, not per-account: without this, a second rider signing in on a
 * shared laptop would be subscribed silently because the first one said yes.
 */
const ENABLED_USERS_KEY = 'swapngo.webPush.enabledUsers';
/** Sign-out must never hang on a slow network. */
const SIGN_OUT_TIMEOUT_MS = 3000;

/**
 * What the settings card shows.
 *   unsupported / insecure / ios-install-required — see WebPushSupport
 *   server-disabled — the backend has no VAPID keys configured
 *   default  — can be enabled (button shown)
 *   enabled  — subscribed and saved for this rider
 *   denied   — the rider blocked notifications; only browser settings can undo it
 */
export type WebPushStatus =
    | Exclude<WebPushSupport, 'supported'>
    | 'server-disabled'
    | 'default'
    | 'enabled'
    | 'denied';

export class WebPushUnavailableError extends Error {
    constructor(message = 'Browser notifications are not available right now.') {
        super(message);
        this.name = 'WebPushUnavailableError';
    }
}

// ---------------------------------------------------------------------------
// Browser glue — everything below touches real browser APIs.
// ---------------------------------------------------------------------------

function isBrowser(): boolean {
    return Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';
}

function readBrowserEnv(): BrowserEnv | null {
    if (!isBrowser()) return null;
    const nav = navigator as Navigator & { standalone?: boolean };
    return {
        isSecureContext: window.isSecureContext === true,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
        hasNotification: 'Notification' in window,
        userAgent: navigator.userAgent ?? '',
        maxTouchPoints: navigator.maxTouchPoints ?? 0,
        standalone: nav.standalone === true
            || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches),
    };
}

export function getWebPushSupport(): WebPushSupport {
    const env = readBrowserEnv();
    return env ? detectWebPushSupport(env) : 'unsupported';
}

// localStorage can throw (private mode, blocked storage) — treat as empty.
function readEnabledUsers(): string[] {
    try {
        return parseEnabledUsers(window.localStorage.getItem(ENABLED_USERS_KEY));
    } catch {
        return [];
    }
}

function writeEnabledUsers(ids: string[]): void {
    try {
        window.localStorage.setItem(ENABLED_USERS_KEY, JSON.stringify([...new Set(ids)]));
    } catch {
        // Storage blocked: the rider simply re-enables next visit.
    }
}

const isEnabledFor = (userId: string) => readEnabledUsers().includes(userId);
const markEnabled = (userId: string) => writeEnabledUsers([...readEnabledUsers(), userId]);
const markDisabled = (userId: string) => writeEnabledUsers(readEnabledUsers().filter((id) => id !== userId));

async function fetchConfig(): Promise<{ enabled: boolean; publicKey: string | null }> {
    try {
        return await api.webPushConfig();
    } catch (err) {
        console.warn('[web-push] could not load config', err);
        return { enabled: false, publicKey: null };
    }
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
    // Root scope: the whole rider app. updateViaCache 'none' so a fixed
    // worker ships on the next visit, not after a stale HTTP cache expires.
    await navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
    return navigator.serviceWorker.ready;
}

async function existingSubscription(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration('/');
    return registration ? registration.pushManager.getSubscription() : null;
}

/** The browser's subscription for the server's current key, creating or replacing it as needed. */
async function ensureSubscription(
    registration: ServiceWorkerRegistration,
    publicKey: string,
): Promise<PushSubscription> {
    const current = await registration.pushManager.getSubscription();
    if (current && subscriptionKeyMatches(current.options.applicationServerKey, publicKey)) return current;
    if (current) await current.unsubscribe();
    return registration.pushManager.subscribe({
        // Required by Chrome and Safari: every push must show a notification.
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
}

async function subscribeAndSave(publicKey: string): Promise<void> {
    const registration = await registerServiceWorker();
    const subscription = await ensureSubscription(registration, publicKey);
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error('The browser returned an incomplete push subscription.');
    }
    await api.saveWebPushSubscription({
        endpoint: json.endpoint,
        expirationTime: json.expirationTime ?? null,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
}

/** Current state for the settings card. Never prompts, never throws. */
export async function getWebPushStatus(userId: string): Promise<WebPushStatus> {
    const support = getWebPushSupport();
    if (support !== 'supported') return support;
    if (Notification.permission === 'denied') return 'denied';

    const config = await fetchConfig();
    if (!config.enabled || !config.publicKey) return 'server-disabled';

    if (Notification.permission !== 'granted' || !isEnabledFor(userId)) return 'default';
    try {
        const subscription = await existingSubscription();
        return subscription && subscriptionKeyMatches(subscription.options.applicationServerKey, config.publicKey)
            ? 'enabled'
            : 'default';
    } catch {
        return 'default';
    }
}

/**
 * The rider tapped "Enable notifications". Must be called straight from that
 * tap: requestPermission() is the FIRST await, because Safari only shows the
 * prompt while the gesture's user activation is still live, and a network
 * round trip before it can consume that.
 *
 * Returns the resulting status; throws only when subscribing or saving fails
 * after permission was granted (the caller shows a retry message).
 */
export async function enableWebPush(userId: string): Promise<WebPushStatus> {
    const support = getWebPushSupport();
    if (support !== 'supported') return support;

    const permission = await Notification.requestPermission();
    // A dismissed prompt stays 'default' — the button stays, and the browser
    // itself rate-limits re-prompts. A block is final until browser settings.
    if (permission === 'denied') return 'denied';
    if (permission !== 'granted') return 'default';

    const config = await fetchConfig();
    if (!config.enabled || !config.publicKey) throw new WebPushUnavailableError();

    await subscribeAndSave(config.publicKey);
    markEnabled(userId);
    return 'enabled';
}

/** The rider turned notifications off for this browser. */
export async function disableWebPush(userId: string): Promise<void> {
    markDisabled(userId);
    if (getWebPushSupport() !== 'supported') return;
    const subscription = await existingSubscription();
    if (!subscription) return;
    try {
        await api.removeWebPushSubscription(subscription.endpoint);
    } finally {
        // Even if the server call failed: an unsubscribed endpoint answers
        // 410, and the backend deletes the row on the next send.
        await subscription.unsubscribe();
    }
}

/**
 * Re-saves this browser's subscription for the signed-in rider — on every
 * sign-in / app open. Refreshes last_seen_at, re-points a browser that
 * changed hands, and replaces a subscription the browser rotated or that
 * predates a VAPID key change. Silent: never prompts, never throws, and does
 * nothing unless THIS rider enabled notifications in THIS browser.
 */
export async function syncWebPush(userId: string): Promise<void> {
    try {
        if (getWebPushSupport() !== 'supported') return;
        if (Notification.permission !== 'granted' || !isEnabledFor(userId)) return;
        const config = await fetchConfig();
        if (!config.enabled || !config.publicKey) return;
        await subscribeAndSave(config.publicKey);
    } catch (err) {
        console.warn('[web-push] background sync failed; will retry next visit', err);
    }
}

/**
 * Sign-out: stop this browser receiving the outgoing rider's notifications.
 * Must run BEFORE the session is dropped — removing the row is an
 * authenticated call. The opt-in is kept, so the same rider signing back in
 * is re-subscribed silently; a different rider is not. Never throws, never
 * takes longer than SIGN_OUT_TIMEOUT_MS.
 */
export async function releaseWebPushOnSignOut(): Promise<void> {
    if (getWebPushSupport() !== 'supported') return;
    const work = (async () => {
        const subscription = await existingSubscription();
        if (!subscription) return;
        try {
            await api.removeWebPushSubscription(subscription.endpoint);
        } finally {
            await subscription.unsubscribe();
        }
    })().catch((err) => console.warn('[web-push] sign-out cleanup failed', err));
    await Promise.race([work, new Promise((resolve) => setTimeout(resolve, SIGN_OUT_TIMEOUT_MS))]);
}

/** Messages the service worker posts to open tabs (see public/sw.js). */
export type ServiceWorkerMessage =
    | { type: 'swapngo:navigate'; href: string }
    | { type: 'swapngo:push-received' };

/** Subscribes to service worker messages; returns the unsubscribe. No-op off the web. */
export function onServiceWorkerMessage(handler: (message: ServiceWorkerMessage) => void): () => void {
    if (!isBrowser() || !('serviceWorker' in navigator)) return () => {};
    const listener = (event: MessageEvent) => {
        const data = event.data as Partial<ServiceWorkerMessage> | null;
        if (data?.type === 'swapngo:push-received') handler({ type: data.type });
        if (data?.type === 'swapngo:navigate' && typeof data.href === 'string') {
            handler({ type: data.type, href: data.href });
        }
    };
    navigator.serviceWorker.addEventListener('message', listener);
    return () => navigator.serviceWorker.removeEventListener('message', listener);
}
