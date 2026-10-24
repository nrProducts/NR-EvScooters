import { describe, expect, it } from "vitest";
import { baseRuleCode, ruleCodeFor } from "../src/modules/billing/billing.service";

/**
 * A scoped rule's stored code must satisfy `pricing_rules_code_check`.
 *
 * ruleCodeFor used to produce `<code>:<uuid>`, which the constraint rejects,
 * so every vehicle/plan/model/subscription-scoped charge or discount rule
 * failed to insert and the admin console got a 500. Same bug, same check, as
 * lateFeeOverride.test.ts.
 */

/** Copied verbatim from 20260819101300_billing_pricing.sql. */
const PRICING_RULE_CODE = /^[a-z][a-z0-9_]*$/;

const VEHICLE = "c02f4040-94d5-48e0-803f-c410d9e0e67b";

describe("ruleCodeFor", () => {
    it("leaves a global rule's code untouched", () => {
        expect(ruleCodeFor("other", "global", null)).toBe("other");
    });

    it("produces a code the DB constraint accepts for every non-global scope", () => {
        for (const scope of ["vehicle", "plan", "vehicle_model", "subscription"]) {
            const code = ruleCodeFor("other", scope, VEHICLE);
            expect(code).toMatch(PRICING_RULE_CODE);
            expect(code).toBe("other_c02f4040_94d5_48e0_803f_c410d9e0e67b");
        }
    });

    it("gives different vehicles different codes, so one rule per vehicle is allowed", () => {
        const other = "0b8a1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d";
        expect(ruleCodeFor("other", "vehicle", VEHICLE)).not.toBe(ruleCodeFor("other", "vehicle", other));
    });
});

describe("baseRuleCode", () => {
    it("round-trips a scoped code back to the console's code", () => {
        const stored = ruleCodeFor("loyalty", "vehicle", VEHICLE);
        expect(baseRuleCode(stored, "vehicle", VEHICLE)).toBe("loyalty");
    });

    it("keeps codes that contain underscores intact", () => {
        const stored = ruleCodeFor("transaction_fee", "vehicle", VEHICLE);
        expect(baseRuleCode(stored, "vehicle", VEHICLE)).toBe("transaction_fee");
    });

    it("returns global codes and unrecognised formats unchanged", () => {
        expect(baseRuleCode("late_fee", "global", null)).toBe("late_fee");
        expect(baseRuleCode("something_else", "vehicle", VEHICLE)).toBe("something_else");
    });
});
