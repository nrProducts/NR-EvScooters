/* eslint-disable no-restricted-globals */
/**
 * Swapngo rider web app — service worker for Web Push.
 *
 * Served from the site root (/sw.js) so its scope is the whole rider app.
 * Expo copies apps/mobile/public/ verbatim into the web export; this file is
 * never bundled and never runs on the native app.
 *
 * Deliberately does NOTHING but push: no fetch handler, no caching. An
 * offline cache would be a separate decision with its own staleness bugs, and
 * a fetch handler that is not needed only slows every request down.
 *
 * Payload contract: apps/backend/src/common/webPush.ts (WebPushPayload).
 */

// ---------------------------------------------------------------------------
// Screen → route. MIRRORS apps/mobile/src/lib/notificationRoute.ts — a
// service worker cannot import the app bundle. tests/webPushServiceWorker.test.ts
// fails if the two disagree, so change both together.
// ---------------------------------------------------------------------------
const OPENABLE_SCREENS = new Set([
  'home', 'my-scooter', 'billing', 'support', 'kyc', 'notifications',
  'booking-history', 'battery-stations', 'profile', 'privacy', 'terms', 'referrals',
]);

const LEGACY_SCREEN_ALIASES = {
  payments: 'billing',
  'post-booking-dashboard': 'my-scooter',
  'booking/billing': 'billing',
  'my-plan': 'billing',
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function resolveNotificationRoute(screen) {
  if (typeof screen !== 'string') return null;
  const path = screen.split(/[?#]/)[0].trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!path) return null;
  const aliased = Object.prototype.hasOwnProperty.call(LEGACY_SCREEN_ALIASES, path)
    ? LEGACY_SCREEN_ALIASES[path]
    : path;
  const parts = aliased.split('/');
  const first = parts[0];
  const rest = parts.slice(1);
  if (rest.length === 0) return OPENABLE_SCREENS.has(first) ? '/' + first : null;
  if (first === 'battery-stations' && rest.length === 1 && SAFE_ID.test(rest[0])) {
    return '/battery-stations/' + rest[0];
  }
  return null;
}

const ICON = '/icons/icon-192.png';

self.addEventListener('install', () => {
  // A new worker has nothing to migrate — take over immediately so a fixed
  // click handler is live on the next push, not after every tab is closed.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function parsePayload(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return { title: 'Swapngo', body: event.data.text() };
  }
}

self.addEventListener('push', (event) => {
  const payload = parsePayload(event) || {};
  const title = typeof payload.title === 'string' && payload.title ? payload.title : 'Swapngo';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const href = resolveNotificationRoute(payload.screen) || '/notifications';

  // ALWAYS show a notification, even with the app open and focused: every
  // subscription is created with userVisibleOnly:true, and Safari revokes a
  // subscription whose pushes do not produce one. The open tabs are told as
  // well, so the in-app bell badge refreshes the moment it arrives.
  event.waitUntil((async () => {
    await self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: ICON,
      // Same tag replaces instead of stacking: the backend tags each push
      // with its delivery id, so a retried send can never show twice.
      tag: typeof payload.tag === 'string' ? payload.tag : undefined,
      data: { href },
    });
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: 'swapngo:push-received' });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  // Re-resolved rather than trusted: data.href was produced by this worker,
  // but an older worker version may have stored something else.
  const href = resolveNotificationRoute(data.href) || '/notifications';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const sameOrigin = windows.filter((c) => new URL(c.url).origin === self.location.origin);
    const existing = sameOrigin.find((c) => c.focused) || sameOrigin[0];
    if (existing) {
      // Focus the open app and let it navigate client-side (keeps its
      // session and state) instead of reloading it.
      await existing.focus();
      existing.postMessage({ type: 'swapngo:navigate', href });
      return;
    }
    await self.clients.openWindow(href);
  })());
});

// No 'pushsubscriptionchange' handler on purpose: re-saving a rotated
// subscription is an authenticated API call and this worker holds no session.
// The app re-syncs the subscription on every visit (lib/webPush.ts), and the
// backend deletes the dead endpoint the first time a push to it returns 410.
