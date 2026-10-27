import { describe, expect, it } from "vitest";
import { freshnessOf } from "../src/modules/telematics/telematics.service";

const NOW = Date.parse("2026-10-26T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

describe("freshnessOf", () => {
    it("is live within 15 minutes", () => {
        expect(freshnessOf(minutesAgo(0), NOW)).toBe("live");
        expect(freshnessOf(minutesAgo(15), NOW)).toBe("live");
    });

    it("is stale between 15 minutes and 6 hours", () => {
        expect(freshnessOf(minutesAgo(16), NOW)).toBe("stale");
        expect(freshnessOf(minutesAgo(6 * 60), NOW)).toBe("stale");
    });

    it("is offline beyond 6 hours, or when the tracker never reported", () => {
        expect(freshnessOf(minutesAgo(6 * 60 + 1), NOW)).toBe("offline");
        expect(freshnessOf(null, NOW)).toBe("offline");
    });
});
