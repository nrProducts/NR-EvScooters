import { describe, expect, it } from "vitest";
import { isAuthInfraError } from "../src/middleware/auth.middleware";

/**
 * requireAuth must tell "couldn't reach Supabase to verify the token" apart
 * from "the token is bad" — the mobile client force-signs-out on any 401, so
 * the former has to become a 503 the client retries, not a 401.
 */
describe("isAuthInfraError", () => {
    it("treats a genuine auth rejection as NOT infra (→ 401)", () => {
        expect(isAuthInfraError({ name: "AuthApiError", status: 401, message: "invalid JWT" })).toBe(false);
        expect(isAuthInfraError({ name: "AuthApiError", status: 403, message: "forbidden" })).toBe(false);
        expect(isAuthInfraError({ status: 400, message: "bad token" })).toBe(false);
        expect(isAuthInfraError(null)).toBe(false);
        expect(isAuthInfraError("no user for token")).toBe(false);
    });

    it("flags supabase-js retryable/network errors as infra (→ 503)", () => {
        expect(isAuthInfraError({ name: "AuthRetryableFetchError", status: 0 })).toBe(true);
        expect(isAuthInfraError({ status: 503, message: "upstream" })).toBe(true);
        expect(isAuthInfraError({ status: 0, message: "" })).toBe(true);
    });

    it("flags a thrown undici fetch failure as infra (→ 503)", () => {
        const err = Object.assign(new TypeError("fetch failed"), {
            cause: { code: "UND_ERR_CONNECT_TIMEOUT", message: "Connect Timeout Error" },
        });
        expect(isAuthInfraError(err)).toBe(true);
    });

    it("flags common socket error codes as infra", () => {
        for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "ECONNRESET", "EAI_AGAIN"]) {
            expect(isAuthInfraError({ code, message: "" })).toBe(true);
        }
    });
});
