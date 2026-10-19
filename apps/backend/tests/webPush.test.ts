import { beforeEach, describe, expect, it, vi } from "vitest";
import { WebPushError } from "web-push";
import { createFakeSupabase, FakeSupabase, QueryHandler } from "./helpers/fakeSupabase";

// One fake per test, swapped in through this holder — vi.mock factories are
// hoisted above the imports, so they can only close over hoisted state.
const h = vi.hoisted(() => ({
    fake: null as unknown as FakeSupabase,
    sendWebPush: vi.fn(),
    sendExpoPush: vi.fn(),
}));

vi.mock("../src/config/supabase", () => ({
    supabaseAdmin: { from: (table: string) => h.fake.from(table) },
}));
vi.mock("../src/common/push", () => ({ sendExpoPush: h.sendExpoPush }));
vi.mock("../src/common/webPush", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../src/common/webPush")>()),
    sendWebPush: h.sendWebPush,
}));

import { env } from "../src/config/env";
import type { sendWebPush as SendWebPushFn } from "../src/common/webPush";
import { saveSubscriptionBody } from "../src/modules/web-push/web-push.validation";
import {
    getWebPushConfig, PRIVATE_BODY_TEXT, removeSubscription, saveSubscription, sendToSubscriptions,
    toWebPushPayload,
} from "../src/modules/web-push/web-push.service";
import { deliverPush } from "../src/modules/notifications/notifications.service";

const VAPID = { publicKey: "BPublicKeyBase64Url", privateKey: "privateKeyBase64Url", subject: "mailto:ops@swapngo.in" };
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const KEYS = { p256dh: "B".repeat(87), auth: "a".repeat(22) };

function useFake(handler: QueryHandler = () => ({ data: [] })) {
    h.fake = createFakeSupabase(handler);
    return h.fake;
}

function sub(id: string, overrides: Partial<{ user_id: string; failure_count: number }> = {}) {
    return { id, user_id: "rider-1", endpoint: `${ENDPOINT}/${id}`, ...KEYS, failure_count: 0, ...overrides };
}

beforeEach(() => {
    vi.clearAllMocks();
    env.vapidPublicKey = VAPID.publicKey;
    env.vapidPrivateKey = VAPID.privateKey;
    env.vapidSubject = VAPID.subject;
    useFake();
});

// ---------------------------------------------------------------------------
// Transport — the real sendWebPush, with web-push's own send injected.
// ---------------------------------------------------------------------------

// The module is mocked for the service tests below; the transport suite needs the real one.
const { sendWebPush: realSendWebPush } =
    await vi.importActual<typeof import("../src/common/webPush")>("../src/common/webPush");

describe("sendWebPush (transport)", () => {
    const target = { endpoint: ENDPOINT, ...KEYS };

    it("encrypts the JSON payload to the subscription with VAPID, a TTL, high urgency and a topic", async () => {
        const send = vi.fn().mockResolvedValue({ statusCode: 201, body: "", headers: {} });
        const outcome = await realSendWebPush(
            target, { title: "Scooter Assigned", body: "Enjoy", screen: "my-scooter", tag: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0" },
            VAPID, send,
        );

        expect(outcome).toEqual({ status: "delivered" });
        const [subscription, payload, options] = send.mock.calls[0];
        expect(subscription).toEqual({ endpoint: ENDPOINT, keys: KEYS });
        expect(JSON.parse(payload)).toEqual({
            title: "Scooter Assigned", body: "Enjoy", screen: "my-scooter", tag: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
        });
        expect(options).toMatchObject({ vapidDetails: VAPID, TTL: 86400, urgency: "high" });
        // URL-safe and ≤32 chars, as RFC 8030 requires of a Topic.
        expect(options.topic).toBe("0f1e2d3c4b5a69788796a5b4c3d2e1f0");
    });

    it.each([404, 410])("reports %i as gone — the only outcome that deletes a subscription", async (statusCode) => {
        const send = vi.fn().mockRejectedValue(new WebPushError("expired", statusCode, {}, "", ENDPOINT));
        await expect(realSendWebPush(target, { title: "t", body: "b" }, VAPID, send))
            .resolves.toEqual({ status: "gone", statusCode });
    });

    it.each([400, 403, 429, 500])("reports %i as a failure, keeping the subscription", async (statusCode) => {
        const send = vi.fn().mockRejectedValue(new WebPushError("nope", statusCode, {}, "push service said no", ENDPOINT));
        const outcome = await realSendWebPush(target, { title: "t", body: "b" }, VAPID, send);
        expect(outcome).toMatchObject({ status: "failed", statusCode });
    });

    it("never throws on a network error", async () => {
        const send = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
        await expect(realSendWebPush(target, { title: "t", body: "b" }, VAPID, send))
            .resolves.toEqual({ status: "failed", statusCode: undefined, error: "ECONNRESET" });
    });
});

// ---------------------------------------------------------------------------
// Validation — the endpoint is a URL the SERVER will call.
// ---------------------------------------------------------------------------

describe("saveSubscriptionBody", () => {
    it("accepts a real PushSubscription.toJSON()", () => {
        for (const endpoint of [
            ENDPOINT,
            "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
            "https://web.push.apple.com/QGuQyavXutnMH",
        ]) {
            expect(saveSubscriptionBody.safeParse({ endpoint, expirationTime: null, keys: KEYS }).success).toBe(true);
        }
    });

    it.each([
        "http://fcm.googleapis.com/fcm/send/abc",
        "https://localhost/push",
        "https://127.0.0.1/push",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/push",
        "https://user:pass@fcm.googleapis.com/x",
        "https://metadata.google.internal/x",
        "not a url",
    ])("rejects %s", (endpoint) => {
        expect(saveSubscriptionBody.safeParse({ endpoint, keys: KEYS }).success).toBe(false);
    });

    it("rejects keys that are not base64url", () => {
        expect(saveSubscriptionBody.safeParse({ endpoint: ENDPOINT, keys: { p256dh: "x y".repeat(10), auth: KEYS.auth } }).success)
            .toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

describe("getWebPushConfig", () => {
    it("hands out the public key — never the private one", () => {
        expect(getWebPushConfig()).toEqual({ enabled: true, publicKey: VAPID.publicKey });
    });

    it("reports disabled when the key pair is incomplete", () => {
        env.vapidPrivateKey = "";
        expect(getWebPushConfig()).toEqual({ enabled: false, publicKey: null });
    });
});

describe("saveSubscription", () => {
    it("upserts the browser against the authenticated caller", async () => {
        const fake = useFake(() => ({ data: null }));
        await saveSubscription("rider-1", { endpoint: ENDPOINT, expirationTime: null, keys: KEYS }, "Mozilla/5.0 Chrome");

        const [write] = fake.on("web_push_subscriptions", "insert");
        expect(write.payload).toMatchObject({
            user_id: "rider-1", endpoint: ENDPOINT, p256dh: KEYS.p256dh, auth: KEYS.auth,
            user_agent: "Mozilla/5.0 Chrome", failure_count: 0, expires_at: null,
        });
    });

    it("refuses with 503 when the server has no VAPID keys", async () => {
        env.vapidPublicKey = "";
        await expect(saveSubscription("rider-1", { endpoint: ENDPOINT, keys: KEYS }))
            .rejects.toMatchObject({ status: 503 });
    });
});

describe("removeSubscription", () => {
    it("is scoped to the caller, so one rider can never delete another's browser", async () => {
        const fake = useFake(() => ({ data: null }));
        await removeSubscription("rider-1", ENDPOINT);

        const [del] = fake.on("web_push_subscriptions", "delete");
        expect(del.filters).toEqual([["eq", "user_id", "rider-1"], ["eq", "endpoint", ENDPOINT]]);
    });
});

describe("toWebPushPayload", () => {
    it("keeps ride-event copy as written and tags it with the delivery id", () => {
        expect(toWebPushPayload(
            { template: "vehicle_assigned", title: "Scooter Assigned to You", body: "Enjoy your ride!", screen: "my-scooter" },
            "delivery-1",
        )).toEqual({ title: "Scooter Assigned to You", body: "Enjoy your ride!", screen: "my-scooter", tag: "delivery-1" });
    });

    it("hides payment details from the lock screen", () => {
        const payload = toWebPushPayload(
            { template: "payment_failed", title: "Payment Failed", body: "Your payment could not be completed: card declined" },
            "d",
        );
        expect(payload.title).toBe("Payment Failed");
        expect(payload.body).toBe(PRIVATE_BODY_TEXT);
    });

    it("hides any amount, even on a template not yet listed", () => {
        expect(toWebPushPayload({ template: "some_new_code", title: "T", body: "You owe ₹500" }, "d").body)
            .toBe(PRIVATE_BODY_TEXT);
    });
});

describe("sendToSubscriptions", () => {
    const send = vi.fn<typeof SendWebPushFn>();

    it("deletes gone subscriptions, stamps delivered ones and counts failures", async () => {
        const fake = useFake(() => ({ data: null }));
        send.mockImplementation(async (target) => {
            if (target.endpoint.endsWith("/ok")) return { status: "delivered" };
            if (target.endpoint.endsWith("/gone")) return { status: "gone", statusCode: 410 };
            return { status: "failed", statusCode: 500, error: "500 boom" };
        });

        const result = await sendToSubscriptions(
            [sub("ok"), sub("gone"), sub("flaky", { failure_count: 2 })],
            { title: "t", body: "b", tag: "x" },
            send,
        );

        expect(result).toEqual({ attempted: 3, delivered: 1, gone: 1, errors: ["500 boom"] });
        const [del] = fake.on("web_push_subscriptions", "delete");
        expect(del.filters).toEqual([["in", "id", ["gone"]]]);
        const updates = fake.on("web_push_subscriptions", "update");
        expect(updates.find((u) => u.filters[0][0] === "in")?.payload).toMatchObject({ failure_count: 0 });
        expect(updates.find((u) => u.filters[0][2] === "flaky")?.payload).toMatchObject({ failure_count: 3 });
    });

    it("sends nothing when web push is not configured", async () => {
        env.vapidPrivateKey = "";
        const result = await sendToSubscriptions([sub("ok")], { title: "t", body: "b" }, send);
        expect(result.attempted).toBe(0);
        expect(send).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Integration with the existing notification pipeline — every rider event
// goes through notifyUser → deliverPush, so this is what makes ride events
// reach the browser.
// ---------------------------------------------------------------------------

describe("deliverPush reaches the rider web app", () => {
    function pipelineFake(webRows: unknown[], tokens: string[] = []) {
        return useFake((q) => {
            if (q.table === "user_devices") return { data: tokens.map((push_token) => ({ push_token })) };
            if (q.table === "web_push_subscriptions" && q.op === "select") return { data: webRows };
            return { data: null };
        });
    }

    const input = { template: "vehicle_assigned" as const, title: "Scooter Assigned to You", body: "Enjoy your ride!", screen: "my-scooter" };

    it("marks the delivery sent when a browser accepted it, tagged with the delivery id", async () => {
        const fake = pipelineFake([sub("browser")]);
        h.sendWebPush.mockResolvedValue({ status: "delivered" });

        await deliverPush("delivery-9", "rider-1", input);

        expect(h.sendWebPush).toHaveBeenCalledWith(
            expect.objectContaining({ endpoint: `${ENDPOINT}/browser` }),
            { title: input.title, body: input.body, screen: "my-scooter", tag: "delivery-9" },
            VAPID,
        );
        const [settle] = fake.on("notification_deliveries", "update");
        expect(settle.payload).toMatchObject({ status: "sent" });
    });

    it("counts a delivery as sent when the phone got it even though a browser failed", async () => {
        const fake = pipelineFake([sub("browser")], ["ExponentPushToken[abc]"]);
        h.sendExpoPush.mockResolvedValue(undefined);
        h.sendWebPush.mockResolvedValue({ status: "failed", statusCode: 500, error: "500" });

        await deliverPush("d", "rider-1", input);

        expect(fake.on("notification_deliveries", "update")[0].payload).toMatchObject({ status: "sent" });
    });

    it("leaves the delivery pending when the only browser turned out to be expired", async () => {
        const fake = pipelineFake([sub("browser")]);
        h.sendWebPush.mockResolvedValue({ status: "gone", statusCode: 410 });

        await deliverPush("d", "rider-1", input);

        expect(fake.on("notification_deliveries", "update")).toHaveLength(0);
        expect(fake.on("web_push_subscriptions", "delete")).toHaveLength(1);
    });

    it("marks the delivery failed with the reason when nothing accepted it", async () => {
        const fake = pipelineFake([sub("browser")]);
        h.sendWebPush.mockResolvedValue({ status: "failed", statusCode: 503, error: "503 unavailable" });

        await deliverPush("d", "rider-1", input);

        expect(fake.on("notification_deliveries", "update")[0].payload)
            .toMatchObject({ status: "failed", error: "503 unavailable" });
    });
});
