/**
 * Read cache and request de-duplication for the API client.
 *
 * Every screen used to fetch what it needed on mount, so moving Home -> My
 * Scooter -> Billing re-requested the same profile, plans, bookings and
 * invoices three times over, and several screens asked for the same thing at
 * the same instant. Two mechanisms fix that, both applied centrally in
 * `request()` so no screen has to opt in:
 *
 *   1. IN-FLIGHT DE-DUP — identical GETs that overlap share one network call.
 *      Always safe, applies to every GET.
 *
 *   2. TTL CACHE — a successful GET is reused for a short, per-endpoint
 *      window. Only endpoints listed in POLICIES are cached; anything not
 *      listed (signed URLs, payment status, anything unknown) is fetched
 *      fresh every time.
 *
 * Staleness is bounded two ways. The windows are short for data that changes
 * server-side (a rider's bookings, invoices, notifications), and the whole
 * cache is dropped the moment ANY write succeeds — a payment, a booking, a
 * profile edit, a consent change — so the screen that follows a mutation
 * always reads the new truth. It is also dropped on sign-out so one account
 * can never see another's cached data.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;

interface Policy {
    test: RegExp;
    ttlMs: number;
}

/**
 * First match wins. Paths here exclude the query string; the key adds it back
 * so `?page=2` and `?page=1` never share an entry.
 */
const POLICIES: Policy[] = [
    // Never cached: short-lived signed URLs and anything about money in flight.
    { test: /\/url$/, ttlMs: 0 },
    { test: /^\/payments\//, ttlMs: 0 },
    { test: /\/return-stage$/, ttlMs: 0 },

    // Reference data — changes on an admin's schedule, not a rider's.
    { test: /^\/vehicle-models(\/featured|\/availability-summary)?$/, ttlMs: 5 * MINUTE },
    { test: /^\/vehicle-models\/[^/]+$/, ttlMs: 5 * MINUTE },
    { test: /^\/legal\/documents\//, ttlMs: 30 * MINUTE },
    { test: /^\/consent\/notice$/, ttlMs: 30 * MINUTE },
    { test: /^\/stations\/nearest$/, ttlMs: 5 * MINUTE },

    // Stock counts move as other riders book — short.
    { test: /^\/vehicle-models\/[^/]+\/availability$/, ttlMs: 20 * SECOND },

    // The rider's own state — short windows, plus cleared on every write.
    { test: /^\/users\/me\/notifications\/unread-count$/, ttlMs: 10 * SECOND },
    { test: /^\/users\/me(\/|$)/, ttlMs: 20 * SECOND },
    { test: /^\/bookings\/me/, ttlMs: 20 * SECOND },
    { test: /^\/rentals\/me/, ttlMs: 20 * SECOND },
    { test: /^\/invoices\/me/, ttlMs: 20 * SECOND },
    { test: /^\/refunds\/me/, ttlMs: 20 * SECOND },
    { test: /^\/deposits\/me/, ttlMs: 20 * SECOND },
    { test: /^\/damages\/me/, ttlMs: 20 * SECOND },
    { test: /^\/referrals\/me/, ttlMs: 20 * SECOND },
    { test: /^\/maintenance\/me/, ttlMs: 20 * SECOND },
];

interface Entry {
    value: unknown;
    expiresAt: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/** Bumped by clearApiCache so a response that was in flight at clear time is not stored. */
let generation = 0;

export function ttlFor(path: string): number {
    for (const policy of POLICIES) {
        if (policy.test.test(path)) return policy.ttlMs;
    }
    return 0;
}

/**
 * Callers get their own copy. Handing out the cached object itself would let
 * one screen's local mutation (sorting a list in place, say) leak into every
 * other screen's view of the same data.
 */
function clone<T>(value: T): T {
    if (value === undefined || value === null) return value;
    return JSON.parse(JSON.stringify(value)) as T;
}

/** Drops everything. Called after any successful write and on sign-out. */
export function clearApiCache(): void {
    generation += 1;
    store.clear();
    inflight.clear();
}

/** Drops cached entries whose key starts with `prefix` (path-level invalidation). */
export function invalidateApiCache(prefix: string): void {
    for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
    }
}

/**
 * Runs `load` for a GET, serving it from the cache or an in-flight twin when it
 * can. `force` skips the cache read (an explicit pull-to-refresh) but still
 * stores the fresh result and still shares an identical in-flight call.
 */
export async function cachedGet<T>(
    key: string,
    path: string,
    load: () => Promise<T>,
    force = false,
): Promise<T> {
    const ttl = ttlFor(path);

    if (ttl > 0 && !force) {
        const hit = store.get(key);
        if (hit) {
            if (hit.expiresAt > Date.now()) return clone(hit.value as T);
            store.delete(key);
        }
    }

    const pending = inflight.get(key);
    if (pending) return clone((await pending) as T);

    const startedAt = generation;
    const promise = load().then((value) => {
        // A write (or sign-out) landed while this was in flight: what came back
        // may predate it, so it is returned to its caller but never stored.
        if (ttl > 0 && startedAt === generation) {
            store.set(key, { value, expiresAt: Date.now() + ttl });
        }
        return value;
    });

    inflight.set(key, promise);
    try {
        return clone(await promise);
    } finally {
        if (inflight.get(key) === promise) inflight.delete(key);
    }
}
