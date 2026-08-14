import { describe, expect, it } from "vitest";
import { REDACTED, maskDocumentNumber, maskLast4, safeAuditPayload } from "../src/common/mask";

describe("maskDocumentNumber", () => {
    it("keeps only the last four characters", () => {
        expect(maskDocumentNumber("DL1420110012345")).toBe("***********2345");
    });

    it("masks short numbers entirely", () => {
        expect(maskDocumentNumber("1234")).toBe("****");
    });

    it("passes null through", () => {
        expect(maskDocumentNumber(null)).toBeNull();
    });
});

describe("maskLast4", () => {
    it("renders a fixed-width mask regardless of the real length", () => {
        expect(maskLast4("2345")).toBe("•••• 2345");
    });

    it("upper-cases alphanumeric tails", () => {
        expect(maskLast4("ab12")).toBe("•••• AB12");
    });

    it("passes null through", () => {
        expect(maskLast4(null)).toBeNull();
        expect(maskLast4("")).toBeNull();
    });
});

describe("safeAuditPayload", () => {
    it("drops secrets and storage locations", () => {
        const out = safeAuditPayload({
            password: "hunter2",
            access_token: "ey...",
            storage_path: "uid/aadhaar/front.jpg",
            file_url: "https://x",
            account_status: "active",
        });
        expect(out).toEqual({ account_status: "active" });
    });

    it("masks rather than drops document numbers", () => {
        expect(safeAuditPayload({ doc_number: "DL1420110012345" })).toEqual({
            doc_number: "***********2345",
        });
    });

    it("returns null for no payload", () => {
        expect(safeAuditPayload(null)).toBeNull();
    });

    // DPDPA: audit_logs is retained for years and sits outside the erasure
    // path, so it must never become a second copy of the rider's profile.
    it("redacts personal data but keeps the key, so the diff still proves what changed", () => {
        const out = safeAuditPayload({
            full_name: "Anitha Raman",
            email: "anitha@example.com",
            phone: "+919876543210",
            date_of_birth: "1995-04-02",
            address_line_1: "12 Velachery Main Rd",
            emergency_contact_phone: "+919876500000",
            push_token: "ExponentPushToken[xxx]",
            nominee_full_name: "R Raman",
            ip: "203.0.113.4",
            account_status: "suspended",
        });

        expect(out).toEqual({
            full_name: REDACTED,
            email: REDACTED,
            phone: REDACTED,
            date_of_birth: REDACTED,
            address_line_1: REDACTED,
            emergency_contact_phone: REDACTED,
            push_token: REDACTED,
            nominee_full_name: REDACTED,
            ip: REDACTED,
            account_status: "suspended",
        });
    });

    it("leaves null personal fields as null so unset does not read as a change", () => {
        expect(safeAuditPayload({ phone: null, email: undefined })).toEqual({
            phone: null,
            email: undefined,
        });
    });

    it("keeps state, which the inventory treats as non-identifying", () => {
        expect(safeAuditPayload({ state: "Tamil Nadu" })).toEqual({ state: "Tamil Nadu" });
    });
});
