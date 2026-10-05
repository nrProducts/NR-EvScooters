import { describe, expect, it } from "vitest";
import { lateFeeOverrideCode } from "../src/modules/payments/renewalFee";

/**
 * The generated override code must satisfy the DB's own constraint.
 *
 * `pricing_rules.code` is declared:
 *
 *     code text not null unique check (code ~ '^[a-z][a-z0-9_]*$')
 *
 * and the original generator produced `late_fee:<uuid>` — containing both a
 * colon and hyphens, neither of which that pattern allows. Every
 * setLateFeeOverride() insert therefore failed the check constraint, so a
 * per-subscription late-fee override could never be created.
 *
 * It failed SILENTLY, which is why it survived: the read paths match on the
 * same generated code, so the lookup always missed and the global rate was
 * used — indistinguishable from "no override configured". Nothing errored,
 * nothing logged, and the feature simply did not exist.
 *
 * This is the cheap check that would have caught it: assert the generator
 * against the constraint it has to satisfy.
 */

/** Copied verbatim from 20260819101300_billing_pricing.sql. */
const PRICING_RULE_CODE = /^[a-z][a-z0-9_]*$/;

describe("lateFeeOverrideCode", () => {
    const uuid = "8f370046-7235-4c15-8f5f-5d1457739b29";

    it("produces a code the pricing_rules CHECK constraint accepts", () => {
        expect(lateFeeOverrideCode(uuid)).toMatch(PRICING_RULE_CODE);
    });

    it("rejects the old colon form, so the regression cannot come back", () => {
        // Documents precisely what was wrong, rather than trusting a comment.
        expect(`late_fee:${uuid}`).not.toMatch(PRICING_RULE_CODE);
    });

    it("holds for any uuid shape, including all-numeric segments", () => {
        for (const id of [
            "00000000-0000-0000-0000-000000000000",
            "ffffffff-ffff-ffff-ffff-ffffffffffff",
            "12345678-1234-1234-1234-123456789012",
        ]) {
            expect(lateFeeOverrideCode(id)).toMatch(PRICING_RULE_CODE);
        }
    });

    it("stays distinguishable from the global rule", () => {
        // The trigger in migration 51 tells them apart by prefix, and
        // computeLateRenewalFee looks the global one up by exact match.
        expect(lateFeeOverrideCode(uuid)).not.toBe("late_fee");
        expect(lateFeeOverrideCode(uuid).startsWith("late_fee_")).toBe(true);
    });

    it("is stable and one-to-one, so read and write always agree", () => {
        const other = "11111111-2222-3333-4444-555555555555";
        expect(lateFeeOverrideCode(uuid)).toBe(lateFeeOverrideCode(uuid));
        expect(lateFeeOverrideCode(uuid)).not.toBe(lateFeeOverrideCode(other));
    });
});
