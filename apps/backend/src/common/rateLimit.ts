/**
 * A tiny fixed-window rate limiter, in memory.
 *
 * Deliberately NOT a new dependency (express-rate-limit et al): the only thing
 * that needs throttling today is the unauthenticated public contact form, and
 * a ~40-line counter covers it without adding a package to the deploy.
 *
 * SCOPE — this is per-process. Render can run more than one instance, so the
 * effective allowance is `limit × instances`. That is fine for its purpose
 * (stopping a bored script and accidental double-submits), and deliberately
 * not presented as a security control. If this ever needs to be exact across
 * instances, move the counter to Postgres or Redis rather than raising the
 * limit here.
 */

import { env } from "../config/env";

interface Window {
    count: number;
    /** Epoch ms at which `count` resets. */
    resetAt: number;
}

export interface RateLimitResult {
    allowed: boolean;
    /** Seconds until the caller may retry. 0 when allowed. */
    retryAfterSeconds: number;
}

export interface RateLimiter {
    check(key: string): RateLimitResult;
    /** Test seam — drops all state. */
    reset(): void;
}

/**
 * @param limit    Requests permitted per window.
 * @param windowMs Window length in milliseconds.
 */
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
    const windows = new Map<string, Window>();
    let lastSweep = 0;

    /**
     * Drop expired entries so an attacker cycling keys (a spoofed
     * X-Forwarded-For, say) can't grow the map without bound. Amortised onto
     * calls rather than a timer, so nothing keeps the event loop alive.
     */
    function sweep(now: number): void {
        if (now - lastSweep < windowMs) return;
        lastSweep = now;
        for (const [key, window] of windows) {
            if (window.resetAt <= now) windows.delete(key);
        }
    }

    return {
        check(key: string): RateLimitResult {
            const now = Date.now();
            sweep(now);

            const existing = windows.get(key);
            if (!existing || existing.resetAt <= now) {
                windows.set(key, { count: 1, resetAt: now + windowMs });
                return { allowed: true, retryAfterSeconds: 0 };
            }

            existing.count += 1;
            if (existing.count > limit) {
                return {
                    allowed: false,
                    retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
                };
            }
            return { allowed: true, retryAfterSeconds: 0 };
        },

        reset(): void {
            windows.clear();
            lastSweep = 0;
        },
    };
}

/**
 * The client IP used as the rate-limit key.
 *
 * With trust proxy configured (TRUST_PROXY_HOPS > 0) this is `req.ip`, which
 * Express resolves by counting hops from the RIGHT of X-Forwarded-For — the
 * entries our own proxies appended.
 *
 * Without it, the legacy behaviour: the FIRST X-Forwarded-For entry. That is
 * the one entry the CLIENT controls (Render appends to an incoming header
 * rather than replacing it), so a script can rotate it per request and never
 * be limited. Kept only so an unconfigured deployment behaves as before;
 * set TRUST_PROXY_HOPS to close it.
 */
export function clientIp(
    req: {
        headers: Record<string, unknown>;
        ip?: string;
        socket?: { remoteAddress?: string };
    },
    trustProxyHops: number = env.trustProxyHops,
): string {
    if (trustProxyHops > 0) {
        return req.ip ?? req.socket?.remoteAddress ?? "unknown";
    }
    const forwarded = req.headers["x-forwarded-for"];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (typeof raw === "string" && raw.trim()) return raw.split(",")[0]!.trim();
    return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}
