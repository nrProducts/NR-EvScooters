import { describe, expect, it } from "vitest";
import {
    assertValidAadhaar, assertValidDocNumber, assertValidDrivingLicence,
    last4, normaliseDocNumber, verhoeffValid,
} from "../src/modules/kyc/kyc.docnumber";
import { toDocumentView, type DocumentRow } from "../src/modules/kyc/kyc.service";

/** Pulls the per-field messages off a thrown AppError. */
function fieldsOf(fn: () => void): Record<string, string> {
    try {
        fn();
    } catch (err) {
        return (err as { fields?: Record<string, string> }).fields ?? {};
    }
    throw new Error("expected the call to throw");
}

// Real Verhoeff-valid check digits, computed from the D5 tables.
const VALID_AADHAAR = ["234567890124", "987654321012", "345678901238", "555555555551"];

describe("verhoeffValid", () => {
    it("accepts numbers carrying a correct check digit", () => {
        for (const n of VALID_AADHAAR) expect(verhoeffValid(n), n).toBe(true);
    });

    // These are the two error classes Verhoeff exists to catch, and the whole
    // reason the check was upgraded from a length test: once the full number
    // is no longer stored, a typo can never be spotted by comparing against
    // the record, because there is no record.
    it("catches every single-digit error", () => {
        const base = "234567890124";
        for (let pos = 0; pos < base.length; pos++) {
            for (let d = 0; d <= 9; d++) {
                if (String(d) === base[pos]) continue;
                const mutated = base.slice(0, pos) + d + base.slice(pos + 1);
                expect(verhoeffValid(mutated), `${base} -> ${mutated}`).toBe(false);
            }
        }
    });

    it("catches adjacent transpositions", () => {
        const base = "234567890124";
        for (let i = 0; i < base.length - 1; i++) {
            if (base[i] === base[i + 1]) continue;
            const swapped =
                base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2);
            expect(verhoeffValid(swapped), `${base} -> ${swapped}`).toBe(false);
        }
    });

    it("rejects non-numeric input rather than throwing", () => {
        expect(verhoeffValid("23456789012A")).toBe(false);
        expect(verhoeffValid("")).toBe(false);
    });
});

describe("assertValidAadhaar", () => {
    it("accepts a valid number", () => {
        expect(() => assertValidAadhaar(VALID_AADHAAR[0])).not.toThrow();
    });

    it("accepts the spacing people actually type", () => {
        expect(() => assertValidAadhaar("2345 6789 0124")).not.toThrow();
        expect(() => assertValidAadhaar("2345-6789-0124")).not.toThrow();
    });

    it("rejects the wrong number of digits", () => {
        expect(() => assertValidAadhaar("123456789")).toThrow(/12-digit/);
        expect(() => assertValidAadhaar("2345678901245")).toThrow(/12-digit/);
    });

    it("rejects letters", () => {
        expect(() => assertValidAadhaar("ABCD12345678")).toThrow(/12-digit/);
    });

    // Previously "ABCD1234" and any 12 digits at all would pass. Both are the
    // regression this test exists for.
    it("rejects a well-formed number with a bad check digit", () => {
        expect(() => assertValidAadhaar("234567890123")).toThrow(/does not look right/);
        // The rider-facing message says "check it against your card"; the
        // technical reason goes in `fields` for the form to render inline.
        expect(fieldsOf(() => assertValidAadhaar("234567890123")).doc_number)
            .toMatch(/check digit/);
    });

    it("rejects numbers beginning 0 or 1, which UIDAI never issues", () => {
        expect(fieldsOf(() => assertValidAadhaar("012345678901")).doc_number)
            .toMatch(/never begins/);
        expect(fieldsOf(() => assertValidAadhaar("112345678901")).doc_number)
            .toMatch(/never begins/);
    });
});

describe("assertValidDrivingLicence", () => {
    it("accepts the common formats", () => {
        expect(() => assertValidDrivingLicence("TN0120200012345")).not.toThrow();
        expect(() => assertValidDrivingLicence("TN-01 20200012345")).not.toThrow();
        expect(() => assertValidDrivingLicence("MH1420110062821")).not.toThrow();
        expect(() => assertValidDrivingLicence("DL0420110149646")).not.toThrow();
    });

    it("rejects an obviously wrong shape", () => {
        expect(() => assertValidDrivingLicence("123456")).toThrow();
        expect(() => assertValidDrivingLicence("TAMILNADU12345")).toThrow();
        expect(() => assertValidDrivingLicence("")).toThrow();
    });

    // Deliberately permissive: state formats genuinely vary, and a false
    // rejection blocks a real rider from renting. A human reviews the licence
    // image regardless.
    it("does not reject an unfamiliar but plausible state format", () => {
        expect(() => assertValidDrivingLicence("KA0520190001234")).not.toThrow();
        expect(() => assertValidDrivingLicence("UP32201512345678")).not.toThrow();
    });
});

describe("assertValidDocNumber", () => {
    it("dispatches on document type", () => {
        expect(() => assertValidDocNumber("aadhaar", "234567890123")).toThrow();
        expect(() => assertValidDocNumber("aadhaar", VALID_AADHAAR[0])).not.toThrow();
        expect(() => assertValidDocNumber("driving_license", "123")).toThrow();
    });

    it("accepts types with no defined format", () => {
        expect(() => assertValidDocNumber("passport", "whatever")).not.toThrow();
        expect(() => assertValidDocNumber("address_proof", "x")).not.toThrow();
    });
});

describe("last4 / normaliseDocNumber", () => {
    it("keeps only the last four alphanumerics", () => {
        expect(last4("234567890124")).toBe("0124");
        expect(last4("TN0120200012345")).toBe("2345");
    });

    it("ignores the separators people type", () => {
        expect(last4("2345 6789 0124")).toBe("0124");
        expect(last4("TN-01 2020 0012345")).toBe("2345");
    });

    it("upper-cases so the same licence never yields two different tails", () => {
        expect(last4("tn0120200012abc")).toBe("2ABC");
        expect(normaliseDocNumber("tn-01")).toBe("TN01");
    });

    it("returns null rather than an empty string for nothing", () => {
        expect(last4(null)).toBeNull();
        expect(last4("")).toBeNull();
        expect(last4("   ---   ")).toBeNull();
    });

    it("returns the whole value when it is shorter than four characters", () => {
        expect(last4("AB")).toBe("AB");
    });
});

// The point of the whole exercise: nothing longer than four characters of an
// identity number may leave the service. This asserts the OUTPUT shape, so it
// fails if anyone reintroduces a full-number field on the public view.
describe("DocumentView carries no full identity number", () => {
    const row: DocumentRow = {
        id: "d1",
        user_id: "u1",
        doc_type: "aadhaar",
        doc_number_last4: "0124",
        storage_path: "u1/aadhaar/front.jpg",
        back_storage_path: null,
        verification_status: "pending",
        rejection_reason: null,
        verified_by: null,
        verified_at: null,
        expiry_date: null,
        submitted_at: null,
        created_at: "2026-08-14T00:00:00Z",
        updated_at: "2026-08-14T00:00:00Z",
    };

    it("exposes only a masked tail", () => {
        expect(toDocumentView(row).doc_number_masked).toBe("•••• 0124");
    });

    it("has no key holding more than four identity characters", () => {
        const view = toDocumentView(row) as Record<string, unknown>;
        for (const [key, value] of Object.entries(view)) {
            if (typeof value !== "string") continue;
            expect(/^\d{5,}$/.test(value), `${key} looks like a raw number`).toBe(false);
        }
    });

    it("never leaks a storage path", () => {
        const view = toDocumentView(row) as Record<string, unknown>;
        expect(Object.values(view)).not.toContain(row.storage_path);
    });

    it("passes a missing tail through as null", () => {
        expect(toDocumentView({ ...row, doc_number_last4: null }).doc_number_masked).toBeNull();
    });
});
