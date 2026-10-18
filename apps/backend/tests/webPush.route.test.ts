import { beforeEach, describe, expect, it, vi } from "vitest";
import express, { NextFunction, Response } from "express";
import request from "supertest";

/**
 * Endpoint-level checks for /users/me/web-push: who may call what, and that
 * the subscription is always bound to the TOKEN's user. requireAuth is
 * replaced by a stub that reads the caller from test headers — token
 * verification itself is covered by the auth middleware's own tests.
 */
const service = vi.hoisted(() => ({
    getWebPushConfig: vi.fn(() => ({ enabled: true, publicKey: "BPublic" })),
    saveSubscription: vi.fn(async () => undefined),
    removeSubscription: vi.fn(async () => undefined),
}));

vi.mock("../src/modules/web-push/web-push.service", () => service);
vi.mock("../src/common/requestLog", () => ({ logRequestError: vi.fn(async () => undefined) }));
vi.mock("../src/middleware/auth.middleware", () => ({
    requireAuth: (req: express.Request & { user?: unknown }, _res: Response, next: NextFunction) => {
        const id = req.header("x-test-user");
        if (!id) return next(Object.assign(new Error("no token"), { status: 401 }));
        req.user = { id, role: req.header("x-test-role") ?? "rider", permissions: new Set() };
        next();
    },
}));

import { riderWebPushRouter } from "../src/modules/web-push/web-push.routes";
import { errorHandler } from "../src/middleware/error.middleware";

const app = express();
app.use(express.json());
app.use("/api/v1/users/me/web-push", riderWebPushRouter);
app.use(errorHandler);

const BASE = "/api/v1/users/me/web-push";
const SUBSCRIPTION = {
    endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    expirationTime: null,
    keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
};

beforeEach(() => vi.clearAllMocks());

describe("POST /users/me/web-push/subscriptions", () => {
    it("binds the subscription to the authenticated rider, ignoring any user id in the body", async () => {
        const res = await request(app)
            .post(`${BASE}/subscriptions`)
            .set("x-test-user", "rider-1")
            .set("User-Agent", "Mozilla/5.0 Test")
            .send({ ...SUBSCRIPTION, user_id: "someone-else", userId: "someone-else" });

        expect(res.status).toBe(204);
        expect(service.saveSubscription).toHaveBeenCalledWith("rider-1", SUBSCRIPTION, "Mozilla/5.0 Test");
    });

    it("is riders only", async () => {
        const res = await request(app)
            .post(`${BASE}/subscriptions`)
            .set("x-test-user", "staff-1").set("x-test-role", "staff")
            .send(SUBSCRIPTION);
        expect(res.status).toBe(403);
        expect(service.saveSubscription).not.toHaveBeenCalled();
    });

    it("rejects an endpoint the server should never call", async () => {
        const res = await request(app)
            .post(`${BASE}/subscriptions`)
            .set("x-test-user", "rider-1")
            .send({ ...SUBSCRIPTION, endpoint: "https://169.254.169.254/latest/meta-data" });
        expect(res.status).toBe(400);
        expect(service.saveSubscription).not.toHaveBeenCalled();
    });
});

describe("DELETE /users/me/web-push/subscriptions", () => {
    it("removes only the caller's own row — any signed-in role may clean up on sign-out", async () => {
        const res = await request(app)
            .delete(`${BASE}/subscriptions`)
            .set("x-test-user", "staff-1").set("x-test-role", "staff")
            .send({ endpoint: SUBSCRIPTION.endpoint });

        expect(res.status).toBe(204);
        expect(service.removeSubscription).toHaveBeenCalledWith("staff-1", SUBSCRIPTION.endpoint);
    });
});

describe("GET /users/me/web-push/config", () => {
    it("returns the public key only", async () => {
        const res = await request(app).get(`${BASE}/config`).set("x-test-user", "rider-1");
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ enabled: true, publicKey: "BPublic" });
    });
});
