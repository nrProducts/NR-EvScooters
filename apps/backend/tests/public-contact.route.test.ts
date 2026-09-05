import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Agent, type Server } from "node:http";
import { app } from "../src/app";

/**
 * Endpoint-level coverage for POST /public/contact — the one unauthenticated
 * write in the API.
 *
 * Email is deliberately NOT configured in the test env (tests/setup.ts sets no
 * RESEND_API_KEY), so a submission that passes validation lands on the "email
 * unavailable" branch. That is the useful thing to assert here anyway: that
 * the failure is a generic 503 which names neither the provider nor the
 * reason. Sending a real message is covered by the manual smoke test in the
 * implementation notes, not by CI.
 *
 * Each test uses its own X-Forwarded-For so the per-IP limiter (module-level,
 * shared across this file) can't leak between cases.
 */

const ENDPOINT = "/api/v1/public/contact";

const VALID = {
    full_name: "John Doe",
    email: "john@example.com",
    phone: "+91 9876543210",
    query_type: "rental",
    message: "I would like to know more about your weekly rental plans.",
    preferred_contact: "whatsapp",
};

/**
 * One listener for the whole file, plus a keep-alive agent.
 *
 * `request(app)` boots a throwaway server AND closes the TCP connection per
 * call; this file makes ~20 in a burst, and alongside every other test file's
 * own throwaway servers running in the same worker, Windows' ephemeral port
 * range (already drained by TIME_WAIT sockets) came up EADDRINUSE. Only
 * reproduces under the full suite, in parallel with everything else — never
 * running this file alone — which is what made it look like a per-test flake
 * at first.
 */
let server: Server;
const agent = new Agent({ keepAlive: true, maxSockets: 4 });
beforeAll(() => {
    server = app.listen(0);
});
afterAll(async () => {
    agent.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (ip: string, body: unknown) =>
    request(server).post(ENDPOINT).set("Connection", "keep-alive").set("X-Forwarded-For", ip).send(body as object).agent(agent);

/**
 * A valid body with a unique sender address. The per-EMAIL limiter (3/hour) is
 * module-level and shared across this file, so tests that reuse one address
 * would exhaust it and start seeing 429s from the wrong limiter — which is
 * exactly what the first draft of this file did.
 */
let seq = 0;
const validFrom = (overrides: Record<string, unknown> = {}) => ({
    ...VALID,
    email: `sender${++seq}@example.com`,
    ...overrides,
});

describe("POST /public/contact — validation", () => {
    it("returns 400 with per-field messages for a wholly invalid body", async () => {
        const res = await post("198.51.100.1", {
            full_name: "J",
            email: "notanemail",
            phone: "12345",
            query_type: "rental",
            message: "hi",
        });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
        expect(res.body.error.fields).toMatchObject({
            full_name: expect.any(String),
            email: expect.any(String),
            phone: expect.any(String),
            message: expect.any(String),
        });
    });

    it("rejects an unknown query type", async () => {
        const res = await post("198.51.100.2", validFrom({ query_type: "hacking" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("query_type");
    });

    it("rejects a message over the maximum length", async () => {
        const res = await post("198.51.100.3", validFrom({ message: "a".repeat(2001) }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("message");
    });

    it("rejects a submission that filled the honeypot", async () => {
        const res = await post("198.51.100.4", validFrom({ company: "Acme Corp" }));
        expect(res.status).toBe(400);
    });

    it("rejects an email carrying a header break", async () => {
        const res = await post("198.51.100.5", {
            ...VALID,
            email: "a@b.com\r\nBcc: victim@evil.com",
        });
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("email");
    });
});

describe("POST /public/contact — failure disclosure", () => {
    it("returns a generic 503 that names neither the provider nor the reason", async () => {
        const res = await post("198.51.100.6", validFrom());

        expect(res.status).toBe(503);
        expect(res.body.error.message).toBe(
            "Unable to submit your query right now. Please try again in a few minutes.",
        );

        // Nothing about Resend, API keys, SMTP or "not configured" may leak.
        const serialised = JSON.stringify(res.body).toLowerCase();
        for (const leak of ["resend", "api key", "apikey", "smtp", "not configured", "stack"]) {
            expect(serialised, `leaked "${leak}"`).not.toContain(leak);
        }
    });

    it("never caches a contact response", async () => {
        const res = await post("198.51.100.7", validFrom());
        expect(res.headers["cache-control"]).toBe("no-store");
    });
});

describe("POST /public/contact — rate limiting", () => {
    it("blocks with 429 and a Retry-After once the per-IP window is spent", async () => {
        const ip = "198.51.100.20";
        // 5 per 15 minutes per IP. Each uses a DIFFERENT sender address so the
        // per-email limiter (3/hour) cannot be what trips first.
        for (let i = 0; i < 5; i++) {
            const res = await post(ip, validFrom());
            expect(res.status, `request ${i + 1} should be allowed`).not.toBe(429);
        }

        const blocked = await post(ip, validFrom());
        expect(blocked.status).toBe(429);
        expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
        expect(blocked.body.error.message).toMatch(/too many submissions from this device/i);
    });

    it("keeps a different IP unaffected", async () => {
        const res = await post("198.51.100.21", validFrom());
        expect(res.status).not.toBe(429);
    });

    it("blocks a repeated sender address even from fresh IPs", async () => {
        const email = "repeat-sender@example.com";
        // 3 per hour per address, each from its own IP so the IP limiter is
        // never the cause.
        for (let i = 0; i < 3; i++) {
            const res = await post(`198.51.101.${i}`, { ...VALID, email });
            expect(res.status, `request ${i + 1} should be allowed`).not.toBe(429);
        }

        const blocked = await post("198.51.101.9", { ...VALID, email });
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.message).toMatch(/already received several messages/i);
    });
});
