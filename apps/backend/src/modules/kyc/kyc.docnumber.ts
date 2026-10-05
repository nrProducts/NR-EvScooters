import { businessRule } from "../../common/AppError";

/**
 * Validation and minimisation of rider identity numbers.
 *
 * The rule this module exists to enforce: a full Aadhaar or driving-licence
 * number may pass through memory to be CHECKED, and must never reach the
 * database. Only `last4()`'s output is persisted.
 *
 * Because the number is no longer stored, validation at the point of entry is
 * the only quality gate that remains — a typo can no longer be spotted later
 * by comparing against the record, because there is no record. That is why
 * the Aadhaar check is a real checksum here rather than the length test it
 * used to be.
 */

// ---------------------------------------------------------------------------
// Verhoeff checksum (UIDAI uses it for the Aadhaar check digit)
// ---------------------------------------------------------------------------

/** Multiplication table for the dihedral group D5. */
const D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

/** Permutation table, applied by position. */
const P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * True when `digits` carries a valid Verhoeff check digit.
 *
 * Catches every single-digit error and every adjacent transposition, which
 * between them are the overwhelming majority of the mistakes a rider makes
 * typing a 12-digit number off a card.
 */
export function verhoeffValid(digits: string): boolean {
    if (!/^\d+$/.test(digits)) return false;
    let c = 0;
    const reversed = digits.split("").reverse();
    for (let i = 0; i < reversed.length; i++) {
        c = D[c][P[i % 8][Number(reversed[i])]];
    }
    return c === 0;
}

// ---------------------------------------------------------------------------
// Normalisation and minimisation
// ---------------------------------------------------------------------------

/** Strips spaces, hyphens and slashes — how these numbers are printed, not stored. */
export const normaliseDocNumber = (raw: string): string =>
    raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * The only part of an identity number Swapngo keeps.
 *
 * Returns null for an empty input rather than an empty string, so a missing
 * value is distinguishable from a stored one in both the API and the column's
 * check constraint.
 */
export function last4(raw: string | null | undefined): string | null {
    if (!raw) return null;
    const normalised = normaliseDocNumber(raw);
    if (normalised.length === 0) return null;
    return normalised.slice(-4);
}

// ---------------------------------------------------------------------------
// Per-type validation
// ---------------------------------------------------------------------------

/**
 * Aadhaar: exactly 12 digits, first digit 2-9 (UIDAI never issues a number
 * starting 0 or 1), and a valid Verhoeff check digit.
 */
export function assertValidAadhaar(docNumber: string): void {
    const digits = normaliseDocNumber(docNumber);

    if (!/^\d{12}$/.test(digits)) {
        throw businessRule("Enter a valid 12-digit Aadhaar number.", {
            doc_number: "Must be exactly 12 digits.",
        });
    }
    if (/^[01]/.test(digits)) {
        throw businessRule("That does not look like a valid Aadhaar number.", {
            doc_number: "An Aadhaar number never begins with 0 or 1.",
        });
    }
    if (!verhoeffValid(digits)) {
        throw businessRule(
            "That Aadhaar number does not look right. Please check it against your card.",
            { doc_number: "The number failed its check digit." },
        );
    }
}

/**
 * Driving licence: 2-letter state code, 2-digit RTO code, then 11-15 further
 * alphanumerics.
 *
 * Deliberately broad. State formats genuinely vary (some include the year of
 * issue, some do not; some are 15 characters, some 16), and this check exists
 * to catch a fat-fingered entry, not to be an authority on every RTO's
 * numbering scheme. A false rejection here blocks a real rider from renting,
 * which is a worse outcome than a malformed number reaching manual review —
 * where a human is looking at the licence image anyway.
 */
export function assertValidDrivingLicence(docNumber: string): void {
    const value = normaliseDocNumber(docNumber);

    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{9,16}$/.test(value)) {
        throw businessRule("Enter a valid driving licence number.", {
            doc_number:
                "Use the number as printed on the licence, for example TN0120200012345.",
        });
    }
}

/** Dispatches to the right check. Types with no defined format are accepted. */
export function assertValidDocNumber(docType: string, docNumber: string): void {
    if (docType === "aadhaar") return assertValidAadhaar(docNumber);
    // `driving_licence`, with a C — that is what `kyc_document_type` spells.
    // Matching on the American spelling meant this returned without checking
    // anything, so every licence number was accepted unvalidated.
    if (docType === "driving_licence") return assertValidDrivingLicence(docNumber);
}
