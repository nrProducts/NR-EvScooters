import { describe, expect, it } from "vitest";
import { toSupportView } from "../src/modules/support/support.service";
import { createSupportBody, updateSupportBody } from "../src/modules/support/support.validation";

/**
 * `description` is no longer a column — it is the ticket's first visible
 * MESSAGE, from `support_ticket_messages`.
 *
 * That is the point of the split: a ticket used to hold one frozen
 * description plus a conversation somewhere else, so a rider who added detail
 * in a reply had it ignored by every screen showing the "description". The
 * wire field is unchanged; where it comes from is not.
 */
describe("toSupportView", () => {
    const message = (body: string, created_at: string, is_internal_note = false) =>
        ({ body, created_at, is_internal_note });

    it("maps a raw row into the API shape", () => {
        const view = toSupportView({
            id: "s-1",
            subject: "Scooter won't unlock",
            status: "open",
            priority: "medium",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
            support_ticket_messages: [
                message("I scanned the QR code but the lock never releases.",
                    "2026-07-24T00:00:00.000Z"),
            ],
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

    it("takes the EARLIEST message, whatever order they arrive in", () => {
        const view = toSupportView({
            id: "s-3",
            subject: "Scooter won't unlock",
            status: "open",
            priority: "medium",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
            support_ticket_messages: [
                message("Still not working.", "2026-07-24T09:00:00.000Z"),
                message("The lock never releases.", "2026-07-24T00:00:00.000Z"),
            ],
        });

        expect(view.description).toBe("The lock never releases.");
    });

    // An internal note is staff talking to each other about the rider. It
    // must never surface as the rider's own description of their problem.
    it("never shows an internal note as the description", () => {
        const view = toSupportView({
            id: "s-4",
            subject: "Billing question",
            status: "open",
            priority: "medium",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
            support_ticket_messages: [
                message("Probable duplicate charge — check with finance.",
                    "2026-07-23T00:00:00.000Z", true),
                message("Was charged twice for the same day.",
                    "2026-07-24T00:00:00.000Z"),
            ],
        });

        expect(view.description).toBe("Was charged twice for the same day.");
    });

    it("is an empty description rather than a crash when there are no messages", () => {
        const view = toSupportView({
            id: "s-5",
            subject: "Empty",
            status: "open",
            priority: "low",
            resolved_at: null,
            created_at: "2026-07-24T00:00:00.000Z",
            support_ticket_messages: [],
        });

        expect(view.description).toBe("");
    });

    it("passes through a resolved_at timestamp once set", () => {
        const view = toSupportView({
            id: "s-2",
            subject: "Billing question",
            status: "resolved",
            priority: "high",
            resolved_at: "2026-07-25T10:00:00.000Z",
            created_at: "2026-07-24T00:00:00.000Z",
            support_ticket_messages: [
                message("Was charged twice for the same day.", "2026-07-24T00:00:00.000Z"),
            ],
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
