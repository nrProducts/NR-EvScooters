import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../src/app";

/**
 * GET /health/client-ip is a temporary measurement aid for TRUST_PROXY_HOPS.
 * It must not exist unless IP_DIAGNOSTIC=on, and trust proxy must stay off
 * unless TRUST_PROXY_HOPS is set — an unconfigured deployment behaves exactly
 * as before this change.
 */
describe("client IP diagnostics", () => {
    it("is 404 unless IP_DIAGNOSTIC=on", async () => {
        const res = await request(app).get("/api/v1/health/client-ip");
        expect(res.status).toBe(404);
    });

    it("leaves trust proxy off by default", () => {
        expect(app.get("trust proxy")).toBe(false);
    });
});
