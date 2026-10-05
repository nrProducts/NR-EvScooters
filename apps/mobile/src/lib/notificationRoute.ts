/**
 * Turns a notification's `screen` into a route this app can actually open —
 * or null when it can't.
 *
 * Every tap handler used to do `router.push(`/${screen}`)` with whatever the
 * backend had stored. `screen` is free text written at send time and kept
 * forever, so it drifted: the backend sent "payments" (never a route here)
 * and "post-booking-dashboard" (a screen since deleted), and tapping either
 * dropped the rider on expo-router's "Unmatched Route" page. Admin broadcasts
 * accept any string too, and old notifications keep their old values after
 * the backend is fixed — so the app has to be the one that refuses to
 * navigate somewhere that does not exist.
 *
 * Allowlist, not a denylist: anything not named here resolves to null, and
 * the caller shows a message instead of navigating. Keep in step with
 * `RiderAppScreen` in apps/backend/src/modules/notifications/notifications.types.ts.
 */

/** Top-level screens a notification may open. Each is a real route under src/app. */
const OPENABLE_SCREENS = new Set([
  'home', 'my-scooter', 'billing', 'support', 'kyc', 'notifications',
  'booking-history', 'battery-stations', 'profile', 'privacy', 'terms',
]);

/**
 * Values already stored on sent notifications that no longer match a route,
 * mapped to where that notification is about now.
 */
const LEGACY_SCREEN_ALIASES: Record<string, string> = {
  // Payment success/failure — billing is where payments live in this app.
  payments: 'billing',
  // Pickup confirmed, scooter assigned, return requested/declined — all about
  // the rider's current scooter. The screen was removed in 0330eca.
  'post-booking-dashboard': 'my-scooter',
  // failed-payment-retry's booking payment reminder. It matched
  // booking/[modelId] with modelId "billing" rather than failing outright.
  'booking/billing': 'billing',
  // Still a route, but only a <Redirect> to /billing.
  'my-plan': 'billing',
};

/** A station id segment — no slashes, dots or query characters. */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function resolveNotificationRoute(screen: unknown): string | null {
  if (typeof screen !== 'string') return null;

  // Query strings and fragments are dropped: nothing sent today uses them,
  // and they are not something to pass through from stored free text.
  const path = screen.split(/[?#]/)[0].trim().replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!path) return null;

  const aliased = LEGACY_SCREEN_ALIASES[path] ?? path;
  const [first, ...rest] = aliased.split('/');

  if (rest.length === 0) {
    return OPENABLE_SCREENS.has(first) ? `/${first}` : null;
  }
  // The one nested target worth deep-linking: a specific station.
  if (first === 'battery-stations' && rest.length === 1 && SAFE_ID.test(rest[0])) {
    return `/battery-stations/${rest[0]}`;
  }
  return null;
}
