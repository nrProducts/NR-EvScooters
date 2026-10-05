import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { Agent, type Server } from "node:http";
import { app } from "../src/app";

/**
 * Endpoint-level coverage for POST /public/pre-book — the fleet-not-ready
 * interest-collection form, modeled on public-contact.route.test.ts.
 *
 * Email is deliberately NOT configured in the test env (tests/setup.ts sets no
 * RESEND_API_KEY), so a submission that passes validation lands on the "email
 * unavailable" branch — the useful thing to assert here anyway: the failure is
 * a generic 503 naming neither the provider nor the reason.
 *
 * Each test uses its own X-Forwarded-For so the per-IP limiter (module-level,
 * shared across this file) can't leak between cases.
 */

const ENDPOINT = "/api/v1/public/pre-book";

const VALID = {
    full_name: "Priya Sharma",
    phone: "+91 9876543210",
    location: "Medavakkam, Chennai",
    email: "priya@example.com",
    plan_preference: "weekly",
    message: "Interested in a scooter for daily office commute.",
};

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
 * A valid body with a unique phone number. The per-PHONE limiter (3/hour) is
 * module-level and shared across this file, so tests that reuse one number
 * would exhaust it and start seeing 429s from the wrong limiter.
 */
let seq = 0;
const validFrom = (overrides: Record<string, unknown> = {}) => ({
    ...VALID,
    phone: `98765${(40000 + ++seq).toString().padStart(5, "0")}`,
    ...overrides,
});

describe("POST /public/pre-book — validation", () => {
    it("returns 400 with per-field messages for a wholly invalid body", async () => {
        const res = await post("198.51.102.1", {
            full_name: "J",
            phone: "12345",
            location: "",
        });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
        expect(res.body.error.fields).toMatchObject({
            full_name: expect.any(String),
            phone: expect.any(String),
            location: expect.any(String),
        });
    });

    it("accepts a submission with only the three required fields", async () => {
        const res = await post("198.51.102.2", {
            full_name: "Arun Kumar",
            phone: validFrom().phone,
            location: "Tambaram",
        });
        // Passes validation and reaches the (unconfigured-email) 503 branch —
        // not a 400 — proving email/plan/message are genuinely optional.
        expect(res.status).toBe(503);
    });

    it("rejects a missing full name", async () => {
        const res = await post("198.51.102.3", validFrom({ full_name: "" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("full_name");
    });

    it("rejects a missing mobile number", async () => {
        const res = await post("198.51.102.4", validFrom({ phone: "" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("phone");
    });

    it("rejects an invalid mobile number", async () => {
        const res = await post("198.51.102.5", validFrom({ phone: "12345" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("phone");
    });

    it("rejects a mobile number that isn't a 10-digit Indian number even with a country code", async () => {
        const res = await post("198.51.102.6", validFrom({ phone: "+1 4155552671" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("phone");
    });

    it("rejects a missing location", async () => {
        const res = await post("198.51.102.7", validFrom({ location: "" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("location");
    });

    it("rejects an invalid optional email", async () => {
        const res = await post("198.51.102.8", validFrom({ email: "not-an-email" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("email");
    });

    it("accepts an absent email", async () => {
        const { email: _omit, ...rest } = validFrom();
        const res = await post("198.51.102.9", rest);
        expect(res.status).toBe(503); // past validation, onto the email-unavailable branch
    });

    it("rejects a message over the maximum length", async () => {
        const res = await post("198.51.102.10", validFrom({ message: "a".repeat(1001) }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("message");
    });

    it("accepts a message right at the maximum length", async () => {
        const res = await post("198.51.102.11", validFrom({ message: "a".repeat(1000) }));
        expect(res.status).toBe(503);
    });

    it("rejects an unknown plan preference", async () => {
        const res = await post("198.51.102.12", validFrom({ plan_preference: "monthly" }));
        expect(res.status).toBe(400);
        expect(res.body.error.fields).toHaveProperty("plan_preference");
    });

    it("defaults plan preference to not_sure when omitted", async () => {
        const { plan_preference: _omit, ...rest } = validFrom();
        const res = await post("198.51.102.13", rest);
        expect(res.status).toBe(503); // reached the send step, so default filled in fine
    });

    it("rejects a submission that filled the honeypot", async () => {
        const res = await post("198.51.102.14", validFrom({ company: "Acme Corp" }));
        expect(res.status).toBe(400);
    });

    it("rejects a name carrying a header break", async () => {
        const res = await post("198.51.102.15", validFrom({ full_name: "Priya\r\nBcc: victim@evil.com" }));
        // Control chars are stripped to a space by singleLine, not rejected —
        // assert the break is actually gone rather than that this 400s.
        expect(res.status).toBe(503);
    });
});

describe("POST /public/pre-book — failure disclosure", () => {
    it("returns a generic 503 that names neither the provider nor the reason", async () => {
        const res = await post("198.51.102.20", validFrom());

        expect(res.status).toBe(503);
        expect(res.body.error.message).toBe(
            "We couldn't submit your request right now. Please try again or contact Swapngo directly.",
        );

        // Nothing about Resend, API keys, SMTP, the submitted phone, or "not
        // configured" may leak.
        const serialised = JSON.stringify(res.body).toLowerCase();
        for (const leak of ["resend", "api key", "apikey", "smtp", "not configured", "stack"]) {
            expect(serialised, `leaked "${leak}"`).not.toContain(leak);
        }
    });

    it("never caches a pre-book response", async () => {
        const res = await post("198.51.102.21", validFrom());
        expect(res.headers["cache-control"]).toBe("no-store");
    });
});

describe("POST /public/pre-book — rate limiting", () => {
    it("blocks with 429 and a Retry-After once the per-IP window is spent", async () => {
        const ip = "198.51.102.30";
        // 5 per 15 minutes per IP. Each uses a DIFFERENT phone so the
        // per-phone limiter (3/hour) cannot be what trips first.
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
        const res = await post("198.51.102.31", validFrom());
        expect(res.status).not.toBe(429);
    });

    it("blocks a repeated phone number even from fresh IPs", async () => {
        const phone = "9876500001";
        // 3 per hour per number, each from its own IP so the IP limiter is
        // never the cause.
        for (let i = 0; i < 3; i++) {
            const res = await post(`198.51.103.${i}`, { ...VALID, phone });
            expect(res.status, `request ${i + 1} should be allowed`).not.toBe(429);
        }

        const blocked = await post("198.51.103.9", { ...VALID, phone });
        expect(blocked.status).toBe(429);
        expect(blocked.body.error.message).toMatch(/already have your pre-booking request/i);
    });
});
