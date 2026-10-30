import type { CopyKey } from '../i18n';

/**
 * Where each pushed screen sits in the app, for AppShell's breadcrumb strip
 * and its back arrow.
 *
 * The back arrow used to exist only when `router.canGoBack()` was true, so a
 * screen opened cold — from a push notification, a deep link, or a refreshed
 * browser tab on the rider web app — had no way out but the bottom bar, and
 * nothing said where in the app it was. Every pushed screen now names its
 * logical parent here: the trail is drawn from it, and Back falls back to it
 * when there is no history to pop.
 *
 * Keys are the screen's route segments joined with "/", exactly as
 * `useSegments()` reports them (dynamic segments keep their brackets).
 * A screen with no entry gets no breadcrumb strip, and Back keeps its old
 * history-only behaviour.
 */
interface TrailNode {
  href: string;
  labelKey: CopyKey;
  parent?: string;
}

const NODES: Record<string, TrailNode> = {
  // Bottom-tab roots. Never drawn as the current crumb — tab screens have no
  // strip — only as ancestors of the screens below.
  '(tabs)/home': { href: '/home', labelKey: 'home.title' },
  '(tabs)/profile': { href: '/profile', labelKey: 'profile.profile' },

  // Home's quick links and header bell.
  'booking-history': { href: '/booking-history', labelKey: 'bookingHistory.title', parent: '(tabs)/home' },
  notifications: { href: '/notifications', labelKey: 'notifications.title', parent: '(tabs)/home' },

  // The Profile sheet's menu.
  kyc: { href: '/kyc', labelKey: 'kyc.title', parent: '(tabs)/profile' },
  support: { href: '/support', labelKey: 'support.title', parent: '(tabs)/profile' },
  terms: { href: '/terms', labelKey: 'terms.title', parent: '(tabs)/profile' },
  referrals: { href: '/referrals', labelKey: 'referrals.title', parent: '(tabs)/profile' },
  privacy: { href: '/privacy', labelKey: 'privacy.title', parent: '(tabs)/profile' },

  // Privacy & data's own sub-screens.
  'privacy/summary': { href: '/privacy/summary', labelKey: 'privacy.summary', parent: 'privacy' },
  'privacy/requests': { href: '/privacy/requests', labelKey: 'privacy.requests.heading', parent: 'privacy' },
  'privacy/nominee': { href: '/privacy/nominee', labelKey: 'privacy.nominee.heading', parent: 'privacy' },
  'privacy/notice': { href: '/privacy/notice', labelKey: 'privacy.notice.link', parent: 'privacy' },
  'privacy/[id]': { href: '/privacy/requests', labelKey: 'privacy.requests.heading', parent: 'privacy/requests' },
};

export interface Crumb {
  href: string;
  labelKey: CopyKey;
}

/**
 * The current screen's ancestors, outermost first — e.g. for a privacy request
 * detail: Profile › Privacy & data › Your requests. Empty for a screen not in
 * the map. The current screen itself is not included; AppShell draws it from
 * its own `title`.
 */
export function ancestorsFor(segments: readonly string[]): Crumb[] {
  const self = NODES[segments.join('/')];
  const trail: Crumb[] = [];
  let key = self?.parent;
  // Bounded walk — a typo'd cycle in NODES must not hang the render.
  for (let i = 0; key && i < 8; i++) {
    const node = NODES[key];
    if (!node) break;
    trail.unshift({ href: node.href, labelKey: node.labelKey });
    key = node.parent;
  }
  return trail;
}
