import { describe, expect, it } from "vitest";
import { deriveEligibility } from "../src/modules/deposits/deposits.service";
import { businessToday } from "../src/common/dates";

const YESTERDAY = "2020-01-01";
const FAR_FUTURE = "2999-01-01";

describe("deriveEligibility", () => {
    it("is not eligible while the rider is short of the required rental days", () => {
        expect(deriveEligibility("held", YESTERDAY, 45, 44)).toBe("not_eligible");
    });

    it("becomes eligible on reaching the threshold, once the holding period has passed", () => {
        expect(deriveEligibility("held", YESTERDAY, 45, 45)).toBe("eligible");
    });

    it("stays ineligible past the threshold if the post-return holding period has not elapsed", () => {
        // Both gates have to be open, not either one.
        expect(deriveEligibility("held", FAR_FUTURE, 45, 90)).toBe("not_eligible");
    });

    it("is not eligible while the rider is still riding and no return date is set", () => {
        expect(deriveEligibility("held", null, 45, 60)).toBe("not_eligible");
    });

    it("ignores the day threshold for a grandfathered deposit that carries none", () => {
        // min = 0 is every deposit taken before the onboarding-charge split:
        // those riders keep the terms they originally agreed to.
        expect(deriveEligibility("held", YESTERDAY, 0, 0)).toBe("eligible");
    });

    it("reports a released deposit as already refunded", () => {
        expect(deriveEligibility("released", YESTERDAY, 45, 90)).toBe("refund_processed");
    });

    it("reports a forfeited deposit as not eligible, however many days were completed", () => {
        expect(deriveEligibility("forfeited", YESTERDAY, 45, 90)).toBe("not_eligible");
    });

    it("is not eligible before the money has even been captured", () => {
        expect(deriveEligibility("pending", null, 45, 0)).toBe("not_eligible");
    });

    it("treats the eligible-on date as starting at the beginning of that day", () => {
        expect(deriveEligibility("held", businessToday(), 0, 0)).toBe("eligible");
    });
});
