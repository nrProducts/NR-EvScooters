import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedGet, clearApiCache, invalidateForWrite, ttlFor } from '../src/lib/apiCache';

beforeEach(() => {
  clearApiCache();
});

describe('ttlFor', () => {
  it('caches reference data longer than a rider\'s own state', () => {
    expect(ttlFor('/vehicle-models')).toBeGreaterThan(ttlFor('/bookings/me/current'));
    expect(ttlFor('/bookings/me/current')).toBeGreaterThan(0);
  });
  it('never caches signed URLs or payment endpoints', () => {
    expect(ttlFor('/users/me/photo/url')).toBe(0);
    expect(ttlFor('/users/me/kyc/documents/abc/url')).toBe(0);
    expect(ttlFor('/payments/plans/p1/quote')).toBe(0);
    expect(ttlFor('/rentals/me/return-stage')).toBe(0);
  });
  it('treats unknown paths as uncached', () => {
    expect(ttlFor('/something/new')).toBe(0);
  });
});

describe('cachedGet', () => {
  it('serves a repeat read from cache', async () => {
    const load = vi.fn().mockResolvedValue({ n: 1 });
    await cachedGet('k', '/users/me', load);
    await cachedGet('k', '/users/me', load);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('shares one network call between overlapping identical reads', async () => {
    let resolve!: (v: unknown) => void;
    const load = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    const a = cachedGet('k', '/something/uncached', load);
    const b = cachedGet('k', '/something/uncached', load);
    resolve({ ok: true });
    expect(await a).toEqual({ ok: true });
    expect(await b).toEqual({ ok: true });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not store uncached paths between calls', async () => {
    const load = vi.fn().mockResolvedValue(1);
    await cachedGet('k', '/something/uncached', load);
    await cachedGet('k', '/something/uncached', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('hands each caller its own copy', async () => {
    await cachedGet('k', '/users/me', async () => ({ items: [1, 2] }));
    const first = await cachedGet<{ items: number[] }>('k', '/users/me', async () => ({ items: [] }));
    first.items.push(99);
    const second = await cachedGet<{ items: number[] }>('k', '/users/me', async () => ({ items: [] }));
    expect(second.items).toEqual([1, 2]);
  });

  it('refetches after clearApiCache (a write happened)', async () => {
    const load = vi.fn().mockResolvedValue(1);
    await cachedGet('k', '/users/me', load);
    clearApiCache();
    await cachedGet('k', '/users/me', load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('does not store a response that was in flight when a write landed', async () => {
    let resolve!: (v: unknown) => void;
    const slow = vi.fn().mockReturnValue(new Promise((r) => { resolve = r; }));
    const pending = cachedGet('k', '/users/me', slow);
    clearApiCache();
    resolve('stale');
    await pending;
    const fresh = vi.fn().mockResolvedValue('new');
    expect(await cachedGet('k', '/users/me', fresh)).toBe('new');
  });

  it('force bypasses the cache read', async () => {
    const load = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b');
    await cachedGet('k', '/users/me', load);
    expect(await cachedGet('k', '/users/me', load, true)).toBe('b');
  });

  it('does not cache a failure', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');
    await expect(cachedGet('k', '/users/me', load)).rejects.toThrow('boom');
    expect(await cachedGet('k', '/users/me', load)).toBe('ok');
  });
});

describe('invalidateForWrite', () => {
  const seed = async (key: string, path: string) => {
    await cachedGet(key, path, async () => ({ path }));
  };
  const has = async (key: string, path: string) => {
    let fetched = false;
    await cachedGet(key, path, async () => { fetched = true; return {}; });
    return !fetched;
  };

  it('a reward card write drops invoices and referrals but keeps the profile and catalogue', async () => {
    await seed('a', '/invoices/me');
    await seed('b', '/referrals/me');
    await seed('c', '/users/me');
    await seed('d', '/vehicle-models');
    invalidateForWrite('/referrals/apply-card');
    expect(await has('a', '/invoices/me')).toBe(false);
    expect(await has('b', '/referrals/me')).toBe(false);
    expect(await has('c', '/users/me')).toBe(true);
    expect(await has('d', '/vehicle-models')).toBe(true);
  });

  it('a payment drops everything the rider owns but keeps reference data', async () => {
    await seed('a', '/bookings/me/current');
    await seed('b', '/invoices/me');
    await seed('c', '/users/me');
    await seed('d', '/vehicle-models');
    await seed('e', '/legal/documents/terms');
    invalidateForWrite('/payments/verify');
    expect(await has('a', '/bookings/me/current')).toBe(false);
    expect(await has('b', '/invoices/me')).toBe(false);
    expect(await has('c', '/users/me')).toBe(false);
    expect(await has('d', '/vehicle-models')).toBe(true);
    expect(await has('e', '/legal/documents/terms')).toBe(true);
  });

  it('a consent or terms write drops the cached profile (consent_up_to_date lives there)', async () => {
    await seed('a', '/users/me');
    await seed('b', '/users/me/consents');
    await seed('c', '/legal/documents/terms');
    invalidateForWrite('/users/me/consents');
    expect(await has('a', '/users/me')).toBe(false);
    expect(await has('b', '/users/me/consents')).toBe(false);
    expect(await has('c', '/legal/documents/terms')).toBe(true);

    await seed('d', '/users/me');
    invalidateForWrite('/users/me/legal/acceptances');
    expect(await has('d', '/users/me')).toBe(false);
  });

  it('marking a notification read leaves everything else alone', async () => {
    await seed('a', '/users/me');
    await seed('b', '/users/me/notifications');
    invalidateForWrite('/users/me/notifications/abc/read');
    expect(await has('a', '/users/me')).toBe(true);
    expect(await has('b', '/users/me/notifications')).toBe(false);
  });

  it('a push-token registration invalidates nothing', async () => {
    await seed('a', '/users/me');
    invalidateForWrite('/users/me/push-token');
    expect(await has('a', '/users/me')).toBe(true);
  });

  it('an unknown write drops everything', async () => {
    await seed('a', '/users/me');
    await seed('d', '/vehicle-models');
    invalidateForWrite('/something/new');
    expect(await has('a', '/users/me')).toBe(false);
    expect(await has('d', '/vehicle-models')).toBe(false);
  });
});
