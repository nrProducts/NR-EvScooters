import { describe, expect, it } from "vitest";
import { returnCompletedBody, settlementDepositAmount } from "../src/modules/rentals/rentals.service";

describe("settlementDepositAmount", () => {
    it("excludes a held deposit that is short of its plan's minimum rental days", () => {
        // This is the case that would otherwise pay out a full refund the
        // instant before settleDepositOnReturn forfeits the same deposit.
        expect(settlementDepositAmount({
            status: "held", amount: 1500, min_rental_days_required: 45, rental_days_completed: 20,
        })).toBe(0);
    });

    it("includes the full amount once the rental-days threshold is met", () => {
        expect(settlementDepositAmount({
            status: "held", amount: 1500, min_rental_days_required: 45, rental_days_completed: 45,
        })).toBe(1500);
    });

    it("includes the full amount for a grandfathered deposit with no threshold", () => {
        // min_rental_days_required = 0 is every deposit taken before the
        // onboarding-charge split — never gated on days at all.
        expect(settlementDepositAmount({
            status: "held", amount: 2000, min_rental_days_required: 0, rental_days_completed: 0,
        })).toBe(2000);
    });

    it("includes the full amount for a deposit already forfeited by damage, not by the day rule", () => {
        // Pre-existing path (recomputeDepositStatusForSubscription): the
        // damage cost that caused this forfeiture already appears in
        // settleReturn's totalCharges, so the full amount here is what
        // cancels it out to zero. Gating on status here too would double-bill
        // the same damage.
        expect(settlementDepositAmount({
            status: "forfeited", amount: 1500, min_rental_days_required: 0, rental_days_completed: 0,
        })).toBe(1500);
        expect(settlementDepositAmount({
            status: "forfeited", amount: 1500, min_rental_days_required: 45, rental_days_completed: 10,
        })).toBe(1500);
    });

    it("is 0 when there is no deposit at all", () => {
        expect(settlementDepositAmount(null)).toBe(0);
    });

    it("excludes a held deposit whose plan marks the deposit non-refundable, even with no day threshold", () => {
        expect(settlementDepositAmount({
            status: "held", amount: 999, min_rental_days_required: 0, rental_days_completed: 0, is_refundable: false,
        })).toBe(0);
    });

    it("includes the full amount for a refundable deposit that met its threshold", () => {
        expect(settlementDepositAmount({
            status: "held", amount: 999, min_rental_days_required: 0, rental_days_completed: 0, is_refundable: true,
        })).toBe(999);
    });

    it("includes the full amount for a non-refundable-flagged deposit already forfeited by damage, not double-counted", () => {
        expect(settlementDepositAmount({
            status: "forfeited", amount: 999, min_rental_days_required: 0, rental_days_completed: 0, is_refundable: false,
        })).toBe(999);
    });
});

describe("returnCompletedBody — the rider's Ride Completed message", () => {
    const THANKS = "Thanks for returning your scooter.";

    it("explains a deposit forfeited for finishing short of the plan's minimum days", () => {
        expect(returnCompletedBody({
            status: "held", amount: 2, min_rental_days_required: 45, rental_days_completed: 7,
        })).toBe(
            `${THANKS} You completed 7 of the 45 rental days your plan requires, `
            + "so your security deposit is not eligible for a refund.",
        );
    });

    it("explains a plan whose deposit is non-refundable, ahead of the day rule", () => {
        expect(returnCompletedBody({
            status: "held", amount: 2000, min_rental_days_required: 45, rental_days_completed: 7, is_refundable: false,
        })).toBe(`${THANKS} Your plan's security deposit is non-refundable, so it will not be refunded.`);
    });

    it("says only thanks when the deposit is refundable", () => {
        expect(returnCompletedBody({
            status: "held", amount: 2000, min_rental_days_required: 45, rental_days_completed: 45,
        })).toBe(THANKS);
        expect(returnCompletedBody({
            status: "held", amount: 2000, min_rental_days_required: 0, rental_days_completed: 0,
        })).toBe(THANKS);
    });

    it("says only thanks with no deposit, or one already forfeited earlier", () => {
        expect(returnCompletedBody(null)).toBe(THANKS);
        expect(returnCompletedBody({
            status: "forfeited", amount: 2000, min_rental_days_required: 45, rental_days_completed: 7,
        })).toBe(THANKS);
    });

    it("always agrees with the settlement: a forfeit message exactly when the deposit counts as 0", () => {
        const cases = [
            { status: "held", amount: 2, min_rental_days_required: 45, rental_days_completed: 7 },
            { status: "held", amount: 2, min_rental_days_required: 45, rental_days_completed: 45 },
            { status: "held", amount: 2, min_rental_days_required: 0, rental_days_completed: 0 },
            { status: "held", amount: 2, min_rental_days_required: 10, rental_days_completed: 3, is_refundable: false },
        ];
        for (const d of cases) {
            expect(returnCompletedBody(d) !== THANKS).toBe(settlementDepositAmount(d) === 0);
        }
    });

    it("keeps money out of the text, so browser notifications show it in full", () => {
        expect(returnCompletedBody({
            status: "held", amount: 2000, min_rental_days_required: 45, rental_days_completed: 7,
        })).not.toContain("₹");
    });
});
