import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import {
  LEGACY_SCREEN_ALIASES, OPENABLE_SCREENS, resolveNotificationRoute,
} from '../src/lib/notificationRoute';

/**
 * public/sw.js runs in the browser's service worker scope, not in the app
 * bundle, so it cannot import notificationRoute.ts and carries a copy of the
 * resolver. These tests load the real file into a sandbox with a fake `self`
 * and drive its event handlers the way a browser would.
 */
const SW_SOURCE = readFileSync(join(__dirname, '../public/sw.js'), 'utf8');

type Listener = (event: Record<string, unknown>) => void;

interface FakeClient {
  url: string;
  focused: boolean;
  focus: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
}

function loadServiceWorker(clients: FakeClient[] = []) {
  const listeners: Record<string, Listener> = {};
  const self = {
    location: { origin: 'https://rider.swapngo.in' },
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn; },
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue(clients),
      openWindow: vi.fn().mockResolvedValue(null),
    },
  };
  const context = vm.createContext({ self, URL });
  vm.runInContext(SW_SOURCE, context);

  /** Fires an event and waits for everything it passed to waitUntil. */
  async function dispatch(type: string, event: Record<string, unknown>) {
    const pending: Promise<unknown>[] = [];
    listeners[type]({ ...event, waitUntil: (p: Promise<unknown>) => pending.push(p) });
    await Promise.all(pending);
  }

  const resolve = vm.runInContext('resolveNotificationRoute', context) as (s: unknown) => string | null;
  return { self, dispatch, resolve };
}

function pushEvent(payload: unknown) {
  return { data: { json: () => payload, text: () => JSON.stringify(payload) } };
}

function client(url: string, focused = false): FakeClient {
  return { url, focused, focus: vi.fn().mockResolvedValue(undefined), postMessage: vi.fn() };
}

describe('sw.js route allowlist mirrors lib/notificationRoute.ts', () => {
  const { resolve } = loadServiceWorker();

  const inputs: unknown[] = [
    ...OPENABLE_SCREENS,
    ...Object.keys(LEGACY_SCREEN_ALIASES),
    '/kyc', ' My-Scooter/ ', 'billing?x=1', 'battery-stations/QIS_12', 'battery-stations/../etc',
    'battery-stations/a/b', 'booking/some-model', '/bookings/returns/abc', 'admin/users', '',
    'constructor', '__proto__', 'toString', undefined, null, 42,
  ];

  it.each(inputs.map((i) => [String(i), i]))('resolves %s identically', (_label, input) => {
    expect(resolve(input)).toBe(resolveNotificationRoute(input));
  });
});

describe('sw.js push handler', () => {
  let sw: ReturnType<typeof loadServiceWorker>;
  const tab = client('https://rider.swapngo.in/home');

  beforeEach(() => {
    sw = loadServiceWorker([tab]);
  });

  it('shows the notification with the backend tag (dedupe) and the resolved route', async () => {
    await sw.dispatch('push', pushEvent({ title: 'Scooter Assigned to You', body: 'Enjoy your ride!', screen: 'my-scooter', tag: 'd-1' }));

    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Scooter Assigned to You', expect.objectContaining({
      body: 'Enjoy your ride!', tag: 'd-1', data: { href: '/my-scooter' },
    }));
    expect(tab.postMessage).toHaveBeenCalledWith({ type: 'swapngo:push-received' });
  });

  it('falls back to the notifications list for an unknown screen', async () => {
    await sw.dispatch('push', pushEvent({ title: 'T', body: 'B', screen: '/admin/refunds' }));
    expect(sw.self.registration.showNotification.mock.calls[0][1].data).toEqual({ href: '/notifications' });
  });

  it('still shows something for a push with no usable payload — Safari revokes silent pushes', async () => {
    await sw.dispatch('push', { data: null });
    expect(sw.self.registration.showNotification).toHaveBeenCalledWith('Swapngo', expect.anything());
  });
});

describe('sw.js notification click', () => {
  function clickEvent(href: string) {
    return { notification: { close: vi.fn(), data: { href } } };
  }

  it('focuses the open app and asks it to navigate in-app', async () => {
    const tab = client('https://rider.swapngo.in/home');
    const sw = loadServiceWorker([tab]);
    await sw.dispatch('notificationclick', clickEvent('/billing'));

    expect(tab.focus).toHaveBeenCalled();
    expect(tab.postMessage).toHaveBeenCalledWith({ type: 'swapngo:navigate', href: '/billing' });
    expect(sw.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window on the route when no tab is open', async () => {
    const sw = loadServiceWorker([]);
    await sw.dispatch('notificationclick', clickEvent('/booking-history'));
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('/booking-history');
  });

  it('ignores tabs on other origins and never opens an unlisted path', async () => {
    const other = client('https://evil.example/home', true);
    const sw = loadServiceWorker([other]);
    await sw.dispatch('notificationclick', clickEvent('https://evil.example/phish'));

    expect(other.postMessage).not.toHaveBeenCalled();
    expect(sw.self.clients.openWindow).toHaveBeenCalledWith('/notifications');
  });
});
