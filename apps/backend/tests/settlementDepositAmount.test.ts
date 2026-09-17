import { describe, expect, it } from "vitest";
import { settlementDepositAmount } from "../src/modules/rentals/rentals.service";

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
});
