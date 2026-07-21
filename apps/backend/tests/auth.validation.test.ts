import { describe, expect, it } from "vitest";
import { e164Phone, otpTestBody } from "../src/modules/auth/auth.validation";
import { deriveSessionFlags } from "../src/modules/auth/auth.service";

describe("e164Phone", () => {
    it("accepts an international number and strips separators", () => {
        expect(e164Phone.parse("+91 98765-43210")).toBe("+919876543210");
        expect(e164Phone.parse("(919) 8765 43210")).toBe("(919) 8765 43210".replace(/[\s()-]/g, ""));
    });

    it("accepts a number without the leading +", () => {
        expect(e164Phone.parse("919876543210")).toBe("919876543210");
    });

    it("rejects too-short numbers", () => {
        expect(() => e164Phone.parse("98765")).toThrow();
    });

    it("rejects a number starting with 0", () => {
        expect(() => e164Phone.parse("0919876543210")).toThrow();
    });

    it("rejects letters", () => {
        expect(() => e164Phone.parse("+91abcd12345")).toThrow();
    });
});

describe("otpTestBody", () => {
    it("parses a valid phone", () => {
        expect(otpTestBody.parse({ phone: "+919876543210" })).toEqual({ phone: "+919876543210" });
    });
    it("rejects a missing phone", () => {
        expect(() => otpTestBody.parse({})).toThrow();
    });
});

describe("deriveSessionFlags", () => {
    const base = { full_name: "Asha", kyc_status: "verified" as const, account_status: "active" as const };

    it("marks admins", () => {
        expect(deriveSessionFlags(base, ["admin"]).is_admin).toBe(true);
        expect(deriveSessionFlags(base, ["rider"]).is_admin).toBe(false);
    });

    it("allows renting only when verified AND active", () => {
        expect(deriveSessionFlags(base, ["rider"]).can_rent).toBe(true);
        expect(deriveSessionFlags({ ...base, kyc_status: "pending" }, ["rider"]).can_rent).toBe(false);
        expect(deriveSessionFlags({ ...base, account_status: "suspended" }, ["rider"]).can_rent).toBe(false);
    });

    it("flags a blank name as needing profile setup", () => {
        expect(deriveSessionFlags({ ...base, full_name: "" }, ["rider"]).needs_profile).toBe(true);
        expect(deriveSessionFlags({ ...base, full_name: "   " }, ["rider"]).needs_profile).toBe(true);
        expect(deriveSessionFlags(base, ["rider"]).needs_profile).toBe(false);
    });
});
