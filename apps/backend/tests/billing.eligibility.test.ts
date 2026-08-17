import { describe, expect, it } from "vitest";
import { isCycleEligibleForEveryNCharge } from "../src/modules/billing/billing.service";

/**
 * Mirrors apply_billing_cycle_charges's own `p_cycle_number % frequency_n =
 * 0` rule exactly (20260817100000_billing_charge_engine.sql) — this is the
 * pure Node copy of that one line, tested the same way
 * computeLateReturnPenalty/computeCancellationCharge are, even though the DB
 * function is what's actually enforced against real charge_rules rows.
 */
describe("isCycleEligibleForEveryNCharge", () => {
    it("is eligible on the 4th, 8th, and 12th cycle for N=4 — the Transaction Fee example", () => {
        expect(isCycleEligibleForEveryNCharge(4, 4)).toBe(true);
        expect(isCycleEligibleForEveryNCharge(8, 4)).toBe(true);
        expect(isCycleEligibleForEveryNCharge(12, 4)).toBe(true);
    });

    it("is not eligible on cycles 1-3, 5-7", () => {
        for (const cycle of [1, 2, 3, 5, 6, 7]) {
            expect(isCycleEligibleForEveryNCharge(cycle, 4)).toBe(false);
        }
    });

    it("treats a non-positive interval as never eligible rather than dividing by zero", () => {
        expect(isCycleEligibleForEveryNCharge(4, 0)).toBe(false);
        expect(isCycleEligibleForEveryNCharge(4, -1)).toBe(false);
    });

    it("supports a different interval, e.g. every 2 cycles", () => {
        expect(isCycleEligibleForEveryNCharge(2, 2)).toBe(true);
        expect(isCycleEligibleForEveryNCharge(3, 2)).toBe(false);
    });
});
