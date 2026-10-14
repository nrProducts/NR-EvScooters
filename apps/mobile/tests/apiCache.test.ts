import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedGet, clearApiCache, ttlFor } from '../src/lib/apiCache';

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
