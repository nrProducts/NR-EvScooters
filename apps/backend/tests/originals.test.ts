import { describe, expect, it } from "vitest";
import { confirmPickupBody } from "../src/modules/bookings/bookings.validation";
import { normaliseOriginals } from "../src/modules/originals/originals.service";

/**
 * The pickup decision on original documents: always answered, either "none
 * taken" or a list — and an "other" document always says what it is.
 */
describe("confirmPickupBody — originals", () => {
    const parse = (body: unknown) => confirmPickupBody.safeParse(body);

    it("accepts 'no originals taken'", () => {
        expect(parse({ originals: { none: true } }).success).toBe(true);
    });

    it("accepts a list of documents", () => {
        const r = parse({ originals: { documents: [{ type: "driving_licence" }, { type: "voter_id" }, { type: "marksheet" }] } });
        expect(r.success).toBe(true);
    });

    it("accepts 'other' with text", () => {
        expect(parse({ originals: { documents: [{ type: "other", other_label: "Ration card" }] } }).success).toBe(true);
    });

    it("REFUSES a pickup with the question unanswered", () => {
        const r = parse({});
        expect(r.success).toBe(false);
    });

    it("refuses an empty document list (that is 'none', which must be said explicitly)", () => {
        expect(parse({ originals: { documents: [] } }).success).toBe(false);
    });

    it("refuses an unknown document type", () => {
        expect(parse({ originals: { documents: [{ type: "passport" }] } }).success).toBe(false);
    });

    it("refuses 'none' mixed with documents", () => {
        expect(parse({ originals: { none: true, documents: [{ type: "voter_id" }] } }).success).toBe(false);
    });

    it("keeps the optional vehicle override working alongside", () => {
        const r = parse({ vehicle_id: "7b7c1c4e-5a5e-4f3b-9d3f-1d6a1a6a6a6a", originals: { none: true } });
        expect(r.success).toBe(true);
    });
});

describe("normaliseOriginals", () => {
    it("treats 'none' as nothing taken", () => {
        expect(normaliseOriginals({ none: true })).toEqual({ taken: false, documents: [] });
    });

    it("merges the same standard document ticked twice", () => {
        const r = normaliseOriginals({ documents: [{ type: "voter_id" }, { type: "voter_id" }] });
        expect(r.documents).toEqual([{ type: "voter_id" }]);
    });

    it("keeps each 'other' as its own document, trimmed", () => {
        const r = normaliseOriginals({
            documents: [{ type: "other", other_label: "  Ration card " }, { type: "other", other_label: "Birth certificate" }],
        });
        expect(r.documents).toEqual([
            { type: "other", other_label: "Ration card" },
            { type: "other", other_label: "Birth certificate" },
        ]);
    });

    it("drops a stray label on a standard document", () => {
        const r = normaliseOriginals({ documents: [{ type: "marksheet", other_label: "ignored" }] });
        expect(r.documents).toEqual([{ type: "marksheet" }]);
    });

    it("refuses an 'other' with no description", () => {
        expect(() => normaliseOriginals({ documents: [{ type: "other", other_label: "   " }] })).toThrow(/other/i);
    });
});
