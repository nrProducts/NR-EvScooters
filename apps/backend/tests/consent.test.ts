import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    ALL_PURPOSES, OPTIONAL_PURPOSES, REQUIRED_PURPOSES, isRequiredPurpose,
} from "../src/modules/consent/consent.purposes";
import { publishNoticeBody, recordConsentBody } from "../src/modules/consent/consent.validation";

const MIGRATION = join(
    __dirname, "../../../supabase/v2/migrations/20260819100100_enums.sql",
);

describe("consent purpose registry", () => {
    // The required/optional split is the whole compliance argument: required
    // purposes cannot be refused without ending the contract, optional ones
    // must be refusable with no consequence. A purpose in neither list would
    // be silently unreachable from the UI; one in both would be incoherent.
    it("partitions the enum exactly — no gaps, no overlap", () => {
        const enumBlock = readFileSync(MIGRATION, "utf8");
        const declared = [
            ...enumBlock
                .slice(
                    enumBlock.indexOf("create type public.consent_purpose"),
                    enumBlock.indexOf("create type public.consent_action"),
                )
                .matchAll(/'([a-z_]+)'/g),
        ].map((m) => m[1]);

        expect(declared.length).toBeGreaterThan(0);
        expect([...ALL_PURPOSES].sort()).toEqual([...declared].sort());

        const overlap = REQUIRED_PURPOSES.filter((p) =>
            (OPTIONAL_PURPOSES as readonly string[]).includes(p),
        );
        expect(overlap).toEqual([]);
        expect(REQUIRED_PURPOSES.length + OPTIONAL_PURPOSES.length).toBe(declared.length);
    });

    it("classifies location and marketing as optional", () => {
        // If either of these ever became required, a rider could not decline
        // tracking without losing the service — which is the outcome the
        // granular-consent requirement exists to prevent.
        expect(isRequiredPurpose("location_services")).toBe(false);
        expect(isRequiredPurpose("marketing_communications")).toBe(false);
        // `referral_program` left the enum with the referral module. A purpose
        // with nothing behind it is a consent request for data we do not
        // collect, so it is not merely optional — it is absent.
        expect(ALL_PURPOSES).not.toContain("referral_program");
    });

    it("classifies identity verification and payments as required", () => {
        expect(isRequiredPurpose("kyc_identity_verification")).toBe(true);
        expect(isRequiredPurpose("payments_and_billing")).toBe(true);
    });
});

describe("recordConsentBody", () => {
    const base = {
        notice_version: "2026-08-14.1",
        language: "en" as const,
        grants: [{ purpose: "marketing_communications", granted: true }],
    };

    it("accepts a well-formed submission", () => {
        expect(recordConsentBody.safeParse(base).success).toBe(true);
    });

    it("requires the notice version, so consent is always tied to shown text", () => {
        const { notice_version: _omitted, ...withoutVersion } = base;
        expect(recordConsentBody.safeParse(withoutVersion).success).toBe(false);
    });

    it("rejects a duplicated purpose rather than picking a winner", () => {
        const result = recordConsentBody.safeParse({
            ...base,
            grants: [
                { purpose: "referral_program", granted: true },
                { purpose: "referral_program", granted: false },
            ],
        });
        expect(result.success).toBe(false);
    });

    it("rejects an unknown purpose", () => {
        const result = recordConsentBody.safeParse({
            ...base,
            grants: [{ purpose: "sell_to_advertisers", granted: true }],
        });
        expect(result.success).toBe(false);
    });

    it("rejects unknown top-level keys instead of dropping them", () => {
        const result = recordConsentBody.safeParse({ ...base, granted_all: true });
        expect(result.success).toBe(false);
    });

    it("only allows the two languages the notice is published in", () => {
        expect(recordConsentBody.safeParse({ ...base, language: "hi" }).success).toBe(false);
        expect(recordConsentBody.safeParse({ ...base, language: "ta" }).success).toBe(true);
    });
});

describe("publishNoticeBody", () => {
    const long = "x".repeat(250);

    it("requires a dated, numbered version", () => {
        expect(
            publishNoticeBody.safeParse({ version: "v2", body_en: long, body_ta: long }).success,
        ).toBe(false);
        expect(
            publishNoticeBody.safeParse({ version: "2026-08-14.1", body_en: long, body_ta: long })
                .success,
        ).toBe(true);
    });

    // A notice cannot be published in English only: DPDPA s.5(3) gives the
    // data principal the right to it in an Eighth Schedule language, and
    // Swapngo's riders are in Chennai.
    it("refuses a notice with no Tamil body", () => {
        expect(
            publishNoticeBody.safeParse({ version: "2026-08-14.1", body_en: long, body_ta: "" })
                .success,
        ).toBe(false);
    });

    it("refuses a suspiciously short body in either language", () => {
        expect(
            publishNoticeBody.safeParse({
                version: "2026-08-14.1", body_en: "See website.", body_ta: long,
            }).success,
        ).toBe(false);
    });
});
