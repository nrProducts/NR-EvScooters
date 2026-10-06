import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { app } from "../src/app";

/**
 * TRUST_PROXY_HOPS=3, measured on the UAT Render service (2026-10-07) via
 * GET /health/client-ip. The path is
 *   client → Cloudflare edge → Render load balancer (10.x) → local proxy (::1)
 * and the observed header was "<client>, <cloudflare>, <10.x>", with the
 * socket peer being the local proxy. These replay that exact shape.
 */
describe("trust proxy = 3 against Render's measured header chain", () => {
    const probe = express();
    probe.set("trust proxy", 3);
    probe.get("/ip", (req, res) => res.json({ ip: req.ip }));

    it("resolves the real client", async () => {
        const res = await request(probe)
            .get("/ip")
            .set("X-Forwarded-For", "106.192.170.192, 162.158.54.4, 10.30.203.20");
        expect(res.body.ip).toBe("106.192.170.192");
    });

    it("ignores an X-Forwarded-For value the client forged", async () => {
        // What Render produced for: curl -H "X-Forwarded-For: 1.2.3.4" ...
        const res = await request(probe)
            .get("/ip")
            .set("X-Forwarded-For", "1.2.3.4, 106.192.170.192, 172.69.122.173, 10.30.203.20");
        expect(res.body.ip).toBe("106.192.170.192");
    });
});

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
