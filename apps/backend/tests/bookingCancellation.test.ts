import { describe, expect, it } from "vitest";
import { computeCancellationCharge } from "../src/modules/bookings/bookings.service";
import {
    DEFAULT_CANCELLATION_TIERS, BEYOND_LAST_TIER_PENALTY_PERCENT,
} from "../src/modules/bookings/cancellation.constants";

/** `createdAt` for a booking made `minutesAgo` minutes before `now`. */
const createdMinutesAgo = (minutesAgo: number, now: Date): string =>
    new Date(now.getTime() - minutesAgo * 60_000).toISOString();

describe("computeCancellationCharge — tier resolution (default tiers 30→25%, 60→50%)", () => {
    const now = new Date("2026-08-29T12:00:00Z");

    it("keeps 25% inside the first tier (10 min after booking)", () => {
        const c = computeCancellationCharge({
            planPaid: 1000, depositAmount: 2000, createdAt: createdMinutesAgo(10, now), now,
        });
        expect(c.penaltyPercent).toBe(25);
        expect(c.penaltyAmount).toBe(250);
        expect(c.depositRefund).toBe(2000);
        expect(c.refundAmount).toBe(2750);
    });

    it("keeps 25% exactly at the first tier boundary (30 min)", () => {
        const c = computeCancellationCharge({ planPaid: 1000, createdAt: createdMinutesAgo(30, now), now });
        expect(c.penaltyPercent).toBe(25);
    });

    it("keeps 50% in the second tier (45 min)", () => {
        const c = computeCancellationCharge({ planPaid: 1000, createdAt: createdMinutesAgo(45, now), now });
        expect(c.penaltyPercent).toBe(50);
        expect(c.penaltyAmount).toBe(500);
    });

    it("keeps 100% past every tier (90 min) — no plan refund, deposit still returned", () => {
        const c = computeCancellationCharge({
            planPaid: 1000, depositAmount: 2000, createdAt: createdMinutesAgo(90, now), now,
        });
        expect(c.penaltyPercent).toBe(BEYOND_LAST_TIER_PENALTY_PERCENT);
        expect(c.penaltyAmount).toBe(1000);
        expect(c.refundAmount).toBe(2000);
    });
});

describe("computeCancellationCharge — edge cases", () => {
    const now = new Date("2026-08-29T12:00:00Z");

    it("treats an unknown created_at as 0 elapsed (most generous tier)", () => {
        const c = computeCancellationCharge({ planPaid: 1000, now });
        expect(c.elapsedMinutes).toBe(0);
        expect(c.penaltyPercent).toBe(25);
    });

    it("does not push the rider into a worse tier on a future-dated created_at", () => {
        const c = computeCancellationCharge({
            planPaid: 1000, createdAt: new Date(now.getTime() + 5 * 60_000).toISOString(), now,
        });
        expect(c.elapsedMinutes).toBe(0);
        expect(c.penaltyPercent).toBe(25);
    });

    it("treats a missing planPaid as zero rather than NaN", () => {
        const c = computeCancellationCharge({ planPaid: null, createdAt: createdMinutesAgo(90, now), now });
        expect(c.planPaid).toBe(0);
        expect(c.penaltyAmount).toBe(0);
        expect(c.refundAmount).toBe(0);
    });

    it("never returns a negative refund", () => {
        const c = computeCancellationCharge({ planPaid: -50, depositAmount: -10, createdAt: createdMinutesAgo(90, now), now });
        expect(c.refundAmount).toBeGreaterThanOrEqual(0);
        expect(c.penaltyAmount).toBeGreaterThanOrEqual(0);
    });

    it("rounds to 2dp without float dust", () => {
        const c = computeCancellationCharge({ planPaid: 999.99, createdAt: createdMinutesAgo(10, now), now });
        expect(c.penaltyAmount).toBe(250); // 999.99 * 0.25 = 249.9975 → 250.00
        expect(c.refundAmount).toBe(749.99);
    });

    it("accepts a custom tier list", () => {
        const c = computeCancellationCharge({
            planPaid: 1000,
            createdAt: createdMinutesAgo(3, now), now,
            tiers: [{ upto_minutes: 5, penalty_percent: 0 }, { upto_minutes: 10, penalty_percent: 40 }],
        });
        expect(c.penaltyPercent).toBe(0);
        expect(c.refundAmount).toBe(1000);
    });

    it("full deposit refund alongside a fee-free plan refund when a 0% tier applies", () => {
        const c = computeCancellationCharge({
            planPaid: 799, depositAmount: 2000,
            createdAt: createdMinutesAgo(1, now), now,
            tiers: [{ upto_minutes: 15, penalty_percent: 0 }],
        });
        expect(c.penaltyAmount).toBe(0);
        expect(c.refundAmount).toBe(2799);
    });
});

describe("computeCancellationCharge — the non-refundable onboarding charge", () => {
    const now = new Date("2026-08-29T12:00:00Z");

    it("keeps the onboarding charge in full and never refunds it", () => {
        // Rider paid 1899 plan + 500 onboarding + 1500 deposit. planPaid is
        // what is left after both are held out, so the tier percentage is
        // charged on the plan alone.
        const c = computeCancellationCharge({
            planPaid: 1899, depositAmount: 1500, onboardingCharge: 500,
            createdAt: createdMinutesAgo(10, now), now,
        });
        expect(c.penaltyPercent).toBe(25);
        expect(c.penaltyAmount).toBe(474.75);
        expect(c.onboardingKept).toBe(500);
        expect(c.depositRefund).toBe(1500);
        // (1899 − 474.75) + 1500. The 500 is absent from the refund entirely.
        expect(c.refundAmount).toBe(2924.25);
    });

    it("does not charge the tier penalty on the onboarding charge as well as keeping it", () => {
        const withCharge = computeCancellationCharge({
            planPaid: 1000, depositAmount: 1500, onboardingCharge: 500,
            createdAt: createdMinutesAgo(10, now), now,
        });
        // Penalty is 25% of 1000, not of 1500 — keeping it AND penalising it
        // would take the rider twice for the same 500.
        expect(withCharge.penaltyAmount).toBe(250);
    });

    it("keeps nothing extra for a booking taken before the split", () => {
        const c = computeCancellationCharge({
            planPaid: 1000, depositAmount: 2000,
            createdAt: createdMinutesAgo(10, now), now,
        });
        expect(c.onboardingKept).toBe(0);
        expect(c.refundAmount).toBe(2750);
    });
});

describe("DEFAULT_CANCELLATION_TIERS", () => {
    it("is the shipped fallback: 30→25, 60→50", () => {
        expect(DEFAULT_CANCELLATION_TIERS).toEqual([
            { upto_minutes: 30, penalty_percent: 25 },
            { upto_minutes: 60, penalty_percent: 50 },
        ]);
    });
});
