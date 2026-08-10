import { describe, expect, it } from "vitest";
import { computeDamageDeduction } from "../src/modules/damages/damages.service";

describe("computeDamageDeduction", () => {
    it("deducts the full damage amount when it's within the deposit (spec example: 2000 deposit, 700 damage)", () => {
        const result = computeDamageDeduction(700, 2000);
        expect(result.depositDeduction).toBe(700);
        expect(result.outstandingAmount).toBe(0);
        // Refund would be 2000 - 700 = 1300, matching the spec's worked example.
    });

    it("caps the deduction at the deposit and creates an outstanding balance when damage exceeds it (spec example: 2500 damage, 2000 deposit)", () => {
        const result = computeDamageDeduction(2500, 2000);
        expect(result.depositDeduction).toBe(2000);
        expect(result.outstandingAmount).toBe(500);
    });

    it("deducts nothing and owes nothing when there's no damage", () => {
        const result = computeDamageDeduction(0, 2000);
        expect(result.depositDeduction).toBe(0);
        expect(result.outstandingAmount).toBe(0);
    });

    it("never produces a negative deduction or outstanding amount, even with a zero deposit", () => {
        const result = computeDamageDeduction(500, 0);
        expect(result.depositDeduction).toBe(0);
        expect(result.outstandingAmount).toBe(500);
    });

    it("deducts exactly the deposit when damage equals it, leaving nothing outstanding and nothing refundable", () => {
        const result = computeDamageDeduction(2000, 2000);
        expect(result.depositDeduction).toBe(2000);
        expect(result.outstandingAmount).toBe(0);
    });
});
