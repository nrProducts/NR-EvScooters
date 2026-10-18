import { describe, expect, it } from 'vitest';
import {
  detectWebPushSupport, parseEnabledUsers, subscriptionKeyMatches, urlBase64ToUint8Array,
  type BrowserEnv,
} from '../src/lib/webPushSupport';

const CHROME_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

function env(overrides: Partial<BrowserEnv> = {}): BrowserEnv {
  return {
    isSecureContext: true, hasServiceWorker: true, hasPushManager: true, hasNotification: true,
    userAgent: CHROME_DESKTOP, maxTouchPoints: 0, standalone: false, ...overrides,
  };
}

describe('detectWebPushSupport', () => {
  it('supports desktop and Android Chrome in a normal tab', () => {
    expect(detectWebPushSupport(env())).toBe('supported');
    expect(detectWebPushSupport(env({ userAgent: CHROME_ANDROID, maxTouchPoints: 5 }))).toBe('supported');
  });

  it('requires https (localhost counts as secure in browsers)', () => {
    expect(detectWebPushSupport(env({ isSecureContext: false }))).toBe('insecure');
  });

  it('tells iPhone users in a Safari tab to add the site to the Home Screen', () => {
    expect(detectWebPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, hasPushManager: false })))
      .toBe('ios-install-required');
  });

  it('recognises an iPad, which reports itself as a Mac with touch', () => {
    expect(detectWebPushSupport(env({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 5, hasPushManager: false })))
      .toBe('ios-install-required');
    // A real Mac (no touch) running Safari 16+ supports push in a tab.
    expect(detectWebPushSupport(env({ userAgent: IPAD_DESKTOP_MODE, maxTouchPoints: 0 }))).toBe('supported');
  });

  it('supports an installed Home Screen app on iOS 16.4+, and not an older one', () => {
    expect(detectWebPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true }))).toBe('supported');
    expect(detectWebPushSupport(env({ userAgent: IPHONE, maxTouchPoints: 5, standalone: true, hasPushManager: false })))
      .toBe('unsupported');
  });

  it('reports unsupported when any API is missing', () => {
    expect(detectWebPushSupport(env({ hasServiceWorker: false }))).toBe('unsupported');
    expect(detectWebPushSupport(env({ hasNotification: false }))).toBe('unsupported');
  });
});

describe('VAPID key helpers', () => {
  // A real VAPID public key: 65 bytes, uncompressed P-256 point (leading 0x04).
  const PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';

  it('decodes base64url to the raw key bytes', () => {
    const bytes = urlBase64ToUint8Array(PUBLIC_KEY);
    expect(bytes).toHaveLength(65);
    expect(bytes[0]).toBe(0x04);
  });

  it('matches a subscription made with the same key, and rejects one from a rotated key', () => {
    const same = urlBase64ToUint8Array(PUBLIC_KEY).slice().buffer;
    const rotated = new Uint8Array(65).fill(4).buffer;
    expect(subscriptionKeyMatches(same, PUBLIC_KEY)).toBe(true);
    expect(subscriptionKeyMatches(rotated, PUBLIC_KEY)).toBe(false);
    expect(subscriptionKeyMatches(null, PUBLIC_KEY)).toBe(false);
  });
});

describe('parseEnabledUsers', () => {
  it('reads the stored opt-ins and survives corrupt storage', () => {
    expect(parseEnabledUsers('["a","b"]')).toEqual(['a', 'b']);
    expect(parseEnabledUsers('["a",3,null]')).toEqual(['a']);
    expect(parseEnabledUsers('{oops')).toEqual([]);
    expect(parseEnabledUsers('{"a":1}')).toEqual([]);
    expect(parseEnabledUsers(null)).toEqual([]);
  });
});
