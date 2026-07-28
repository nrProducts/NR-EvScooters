import { describe, expect, it } from "vitest";
import { isReferralExpired } from "../src/modules/referrals/referrals.service";
import { redeemReferralBody } from "../src/modules/referrals/referrals.validation";
import { REFERRAL_CODE_EXPIRY_DAYS } from "../src/modules/referrals/referrals.constants";

describe("isReferralExpired", () => {
    it("is not expired right after account creation", () => {
        expect(isReferralExpired(new Date().toISOString())).toBe(false);
    });

    it("is not expired one day before the window closes", () => {
        const createdAt = new Date(Date.now() - (REFERRAL_CODE_EXPIRY_DAYS - 1) * 24 * 60 * 60 * 1000);
        expect(isReferralExpired(createdAt)).toBe(false);
    });

    it("is expired once the window has passed", () => {
        const createdAt = new Date(Date.now() - (REFERRAL_CODE_EXPIRY_DAYS + 1) * 24 * 60 * 60 * 1000);
        expect(isReferralExpired(createdAt)).toBe(true);
    });
});

describe("redeemReferralBody", () => {
    it("uppercases the code", () => {
        expect(redeemReferralBody.parse({ code: "abcd1234" }).code).toBe("ABCD1234");
    });

    it("rejects a code that is too short", () => {
        expect(() => redeemReferralBody.parse({ code: "ab" })).toThrow();
    });

    it("rejects a missing code", () => {
        expect(() => redeemReferralBody.parse({})).toThrow();
    });
});
