import { describe, expect, it } from "vitest";
import { ASK_EVERY_MS, askedRecently, isNewerBuild } from "../src/lib/updateRules";

describe("isNewerBuild", () => {
    it("compares build numbers as numbers, so 10 beats 9", () => {
        expect(isNewerBuild("10", "9")).toBe(true);
        expect(isNewerBuild(10, "9")).toBe(true);
    });

    it("does not prompt for the same or an older build", () => {
        expect(isNewerBuild("9", "9")).toBe(false);
        expect(isNewerBuild("8", "9")).toBe(false);
    });

    it("does not prompt when either side is not a number", () => {
        expect(isNewerBuild("abc", "9")).toBe(false);
        expect(isNewerBuild("10", "-")).toBe(false);
        expect(isNewerBuild("10", "")).toBe(false);
        expect(isNewerBuild("", "9")).toBe(false);
    });
});

describe("askedRecently", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");

    it("has not asked when there is no record", () => {
        expect(askedRecently(null, now)).toBe(false);
    });

    it("holds off for a day after asking", () => {
        expect(askedRecently(new Date(now - ASK_EVERY_MS + 60_000).toISOString(), now)).toBe(true);
    });

    it("asks again once a day has passed", () => {
        expect(askedRecently(new Date(now - ASK_EVERY_MS - 60_000).toISOString(), now)).toBe(false);
    });

    it("treats a corrupt record as not asked", () => {
        expect(askedRecently("not a date", now)).toBe(false);
    });
});
