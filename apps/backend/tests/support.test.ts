import { describe, expect, it } from "vitest";
import { toSupportView } from "../src/modules/support/support.service";
import { createSupportBody, updateSupportBody } from "../src/modules/support/support.validation";

describe("toSupportView", () => {
    it("maps a raw row into the API shape", () => {
        const view = toSupportView({
            id: "s-1",
            subject: "Scooter won't unlock",
            description: "I scanned the QR code but the lock never releases.",
            status: "open",
            priority: "medium",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
        });

        expect(view).toEqual({
            id: "s-1",
            subject: "Scooter won't unlock",
            description: "I scanned the QR code but the lock never releases.",
            status: "open",
            priority: "medium",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
        });
    });

    it("passes through a resolved_at timestamp once set", () => {
        const view = toSupportView({
            id: "s-2",
            subject: "Billing question",
            description: "Was charged twice for the same day.",
            status: "resolved",
            priority: "high",
            resolved_at: "2026-07-25T10:00:00.000Z",
            created_at: "2026-07-24T00:00:00.000Z",
        });

        expect(view.resolved_at).toBe("2026-07-25T10:00:00.000Z");
    });
});

describe("createSupportBody", () => {
    it("rejects a too-short subject", () => {
        expect(() => createSupportBody.parse({ subject: "Hi", description: "A description long enough." }))
            .toThrow();
    });

    it("rejects a too-short description", () => {
        expect(() => createSupportBody.parse({ subject: "Valid subject", description: "short" })).toThrow();
    });

    it("accepts a valid payload", () => {
        const parsed = createSupportBody.parse({
            subject: "Scooter won't unlock",
            description: "I scanned the QR code but the lock never releases.",
        });
        expect(parsed.subject).toBe("Scooter won't unlock");
    });
});

describe("updateSupportBody", () => {
    it("rejects an empty patch", () => {
        expect(() => updateSupportBody.parse({})).toThrow();
    });

    it("accepts a status-only patch", () => {
        expect(updateSupportBody.parse({ status: "in_progress" }).status).toBe("in_progress");
    });

    it("rejects an unknown status", () => {
        expect(() => updateSupportBody.parse({ status: "archived" })).toThrow();
    });
});
