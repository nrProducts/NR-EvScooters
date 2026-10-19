import { z } from "zod";

/** base64url, the encoding PushSubscription.toJSON() uses for both keys. */
const base64Url = /^[A-Za-z0-9_-]+={0,2}$/;

/**
 * A push service endpoint. HTTPS only — every browser vendor's is — and no
 * credentials or private hosts, so a hostile client cannot turn the send path
 * into a request to localhost or the cloud metadata service. The push is sent
 * BY the server TO this URL, which is exactly the SSRF shape to be strict on.
 */
const endpoint = z
    .string()
    .trim()
    .max(2048, "Subscription endpoint is too long.")
    .url("A valid subscription endpoint is required.")
    .refine((value) => {
        try {
            const url = new URL(value);
            if (url.protocol !== "https:" || url.username || url.password) return false;
            const host = url.hostname.toLowerCase();
            if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) return false;
            // A literal IP is never a push service; blocks 127.x, 10.x,
            // 169.254.169.254 and friends in one rule, IPv6 included.
            if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return false;
            return host.includes(".");
        } catch {
            return false;
        }
    }, "Subscription endpoint must be an https push service URL.");

export const saveSubscriptionBody = z.object({
    endpoint,
    expirationTime: z.number().int().positive().nullable().optional(),
    keys: z.object({
        // An uncompressed P-256 point is 65 bytes → 87 base64url chars.
        p256dh: z.string().trim().min(16).max(256).regex(base64Url, "Invalid p256dh key."),
        // The auth secret is 16 bytes → 22 base64url chars.
        auth: z.string().trim().min(8).max(64).regex(base64Url, "Invalid auth secret."),
    }),
});

export const removeSubscriptionBody = z.object({
    // Not the strict schema above: removing must work for any row we hold,
    // including one saved before a validation rule tightened.
    endpoint: z.string().trim().min(1).max(2048),
});
