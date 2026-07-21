import { describe, expect, it } from "vitest";
import { deriveKycStatus } from "../src/modules/kyc/kyc.service";
import { kycCompletionPercent } from "../src/modules/users/users.service";
import type { KycDocType, VerificationStatus } from "../src/types";

const doc = (
    doc_type: KycDocType,
    verification_status: VerificationStatus,
    expiry_date: string | null = null,
) => ({ doc_type, verification_status, expiry_date });

const FUTURE = "2099-01-01";
const PAST = "2020-01-01";

describe("deriveKycStatus", () => {
    it("is not_submitted with no documents", () => {
        expect(deriveKycStatus([])).toBe("not_submitted");
    });

    it("is pending when every mandatory document awaits review", () => {
        expect(
            deriveKycStatus([doc("aadhaar", "pending"), doc("driving_license", "pending", FUTURE)]),
        ).toBe("pending");
    });

    it("is partially_verified with a mix of verified and pending", () => {
        expect(
            deriveKycStatus([doc("aadhaar", "verified"), doc("driving_license", "pending", FUTURE)]),
        ).toBe("partially_verified");
    });

    it("is verified only when all mandatory documents are verified", () => {
        expect(
            deriveKycStatus([doc("aadhaar", "verified"), doc("driving_license", "verified", FUTURE)]),
        ).toBe("verified");
    });

    it("is rejected when one mandatory document is rejected", () => {
        expect(
            deriveKycStatus([doc("aadhaar", "verified"), doc("driving_license", "rejected", FUTURE)]),
        ).toBe("rejected");
    });

    it("rejection outranks a full set of verified documents", () => {
        expect(
            deriveKycStatus([
                doc("aadhaar", "rejected"),
                doc("driving_license", "verified", FUTURE),
            ]),
        ).toBe("rejected");
    });

    it("treats an expired licence as not verified", () => {
        expect(
            deriveKycStatus([doc("aadhaar", "verified"), doc("driving_license", "verified", PAST)]),
        ).toBe("partially_verified");
    });

    it("ignores non-mandatory document types", () => {
        expect(
            deriveKycStatus([
                doc("aadhaar", "verified"),
                doc("driving_license", "verified", FUTURE),
                doc("passport", "rejected"),
            ]),
        ).toBe("verified");
    });

    it("keeps mandatory doc types to exactly aadhaar and driving_license", () => {
        expect(deriveKycStatus([doc("aadhaar", "verified")])).toBe("partially_verified");
        expect(deriveKycStatus([doc("passport", "verified")])).toBe("not_submitted");
    });
});

describe("kycCompletionPercent", () => {
    it("reports 0 with nothing verified", () => {
        expect(kycCompletionPercent([doc("aadhaar", "pending")])).toBe(0);
    });

    it("reports 50 with one of two verified", () => {
        expect(kycCompletionPercent([doc("aadhaar", "verified")])).toBe(50);
    });

    it("reports 100 with both verified and unexpired", () => {
        expect(
            kycCompletionPercent([doc("aadhaar", "verified"), doc("driving_license", "verified", FUTURE)]),
        ).toBe(100);
    });

    it("does not count an expired document toward completion", () => {
        expect(
            kycCompletionPercent([doc("aadhaar", "verified"), doc("driving_license", "verified", PAST)]),
        ).toBe(50);
    });
});
