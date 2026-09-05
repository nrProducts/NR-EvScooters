import { describe, expect, it, beforeEach, vi } from "vitest";
import { contactQueryBody, MESSAGE_MAX, MESSAGE_MIN } from "../src/modules/public/public.validation";
import { createRateLimiter, clientIp } from "../src/common/rateLimit";

/** A submission that passes every rule — each test varies one field from it. */
const VALID = {
    full_name: "Rukeshkumar K",
    email: "rider@example.com",
    phone: "+91 98765 43210",
    query_type: "rental",
    message: "I would like to know more about your weekly rental plans.",
    preferred_contact: "whatsapp",
};

function parse(overrides: Record<string, unknown> = {}) {
    return contactQueryBody.safeParse({ ...VALID, ...overrides });
}

describe("contactQueryBody — happy path", () => {
    it("accepts a well-formed submission", () => {
        const result = parse();
        expect(result.success).toBe(true);
    });

    it("normalises the phone to bare 10 digits", () => {
        for (const spelling of ["+91 98765 43210", "098765-43210", "9876543210", "(91)9876543210"]) {
            const result = parse({ phone: spelling });
            expect(result.success, spelling).toBe(true);
            if (result.success) expect(result.data.phone).toBe("9876543210");
        }
    });

    it("lowercases and trims the email", () => {
        const result = parse({ email: "  Rider@Example.COM  " });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.email).toBe("rider@example.com");
    });

    it("treats preferred_contact as optional", () => {
        const result = parse({ preferred_contact: undefined });
        expect(result.success).toBe(true);
        if (result.success) expect(result.data.preferred_contact).toBeUndefined();
    });
});

describe("contactQueryBody — rejections", () => {
    it("rejects a missing or too-short name", () => {
        expect(parse({ full_name: "" }).success).toBe(false);
        expect(parse({ full_name: "R" }).success).toBe(false);
    });

    it("rejects a malformed email", () => {
        for (const bad of ["", "notanemail", "no@domain", "a b@example.com"]) {
            expect(parse({ email: bad }).success, bad).toBe(false);
        }
    });

    it("rejects non-Indian / malformed phone numbers", () => {
        for (const bad of ["", "12345", "1234567890", "5876543210", "98765432101", "+1 415 555 0100"]) {
            expect(parse({ phone: bad }).success, bad).toBe(false);
        }
    });

    it("rejects an unknown query type", () => {
        expect(parse({ query_type: "hacking" }).success).toBe(false);
        expect(parse({ query_type: "" }).success).toBe(false);
    });

    it("enforces the message length bounds", () => {
        expect(parse({ message: "too short" }).success).toBe(false);
        expect(parse({ message: "a".repeat(MESSAGE_MIN) }).success).toBe(true);
        expect(parse({ message: "a".repeat(MESSAGE_MAX) }).success).toBe(true);
        expect(parse({ message: "a".repeat(MESSAGE_MAX + 1) }).success).toBe(false);
    });

    it("rejects an unknown preferred_contact", () => {
        expect(parse({ preferred_contact: "telegram" }).success).toBe(false);
    });
});

describe("contactQueryBody — injection and spam defences", () => {
    it("strips CR/LF from the name so it cannot forge an email header", () => {
        const result = parse({ full_name: "Bob\r\nBcc: victim@example.com" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.full_name).not.toMatch(/[\r\n]/);
            expect(result.data.full_name).toBe("Bob Bcc: victim@example.com");
        }
    });

    it("rejects an email address carrying a newline", () => {
        // Collapsed to a single line first, which then fails the format check
        // rather than reaching Reply-To with a header break in it.
        const result = parse({ email: "rider@example.com\r\nBcc: victim@example.com" });
        expect(result.success).toBe(false);
    });

    it("keeps newlines inside the message but drops other controls", () => {
        // A pasted message can carry a bell or vertical tab; newline must survive.
        const BELL = String.fromCharCode(7);
        const VTAB = String.fromCharCode(11);
        const result = parse({
            message: `Line one.
Line two.${BELL} Still asking${VTAB} about plans.`,
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.message).toContain(String.fromCharCode(10));
            const codes = [...result.data.message].map((c) => c.codePointAt(0) ?? 0);
            const strays = codes.filter((c) => (c < 32 && c !== 10 && c !== 9) || c === 127);
            expect(strays).toEqual([]);
        }
    });

    it("rejects a submission that filled the honeypot", () => {
        expect(parse({ company: "Acme Corp" }).success).toBe(false);
        // Absent or empty is what a real visitor sends.
        expect(parse({ company: "" }).success).toBe(true);
        expect(parse({ company: undefined }).success).toBe(true);
    });
});

describe("createRateLimiter", () => {
    const limiter = createRateLimiter(3, 60_000);
    beforeEach(() => limiter.reset());

    it("allows up to the limit then blocks", () => {
        expect(limiter.check("a").allowed).toBe(true);
        expect(limiter.check("a").allowed).toBe(true);
        expect(limiter.check("a").allowed).toBe(true);

        const blocked = limiter.check("a");
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("counts each key independently", () => {
        limiter.check("a");
        limiter.check("a");
        limiter.check("a");
        expect(limiter.check("a").allowed).toBe(false);
        expect(limiter.check("b").allowed).toBe(true);
    });

    it("starts a fresh window once the old one expires", () => {
        // Fake timers, so this asserts the rollover rather than racing it: a
        // real short window can elapse BETWEEN the first two calls and make
        // the "blocked" assertion flaky.
        vi.useFakeTimers();
        try {
            const windowed = createRateLimiter(1, 60_000);

            expect(windowed.check("a").allowed).toBe(true);
            expect(windowed.check("a").allowed).toBe(false);

            vi.advanceTimersByTime(59_000);
            expect(windowed.check("a").allowed, "still inside the window").toBe(false);

            vi.advanceTimersByTime(2_000);
            expect(windowed.check("a").allowed, "window has rolled over").toBe(true);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe("clientIp", () => {
    it("prefers the first hop of x-forwarded-for", () => {
        expect(
            clientIp({ headers: { "x-forwarded-for": "203.0.113.5, 70.41.3.18" }, ip: "10.0.0.1" }),
        ).toBe("203.0.113.5");
    });

    it("falls back to req.ip then the socket", () => {
        expect(clientIp({ headers: {}, ip: "10.0.0.1" })).toBe("10.0.0.1");
        expect(clientIp({ headers: {}, socket: { remoteAddress: "10.0.0.2" } })).toBe("10.0.0.2");
        expect(clientIp({ headers: {} })).toBe("unknown");
    });
});
