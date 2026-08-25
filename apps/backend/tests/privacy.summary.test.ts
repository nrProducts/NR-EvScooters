import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RECIPIENTS } from "../src/modules/privacy/privacy.summary";

const ROOT = join(__dirname, "../../..");

const SUMMARY_SRC = readFileSync(
    join(__dirname, "../src/modules/privacy/privacy.summary.ts"), "utf8",
);
const ROUTES_SRC = readFileSync(
    join(__dirname, "../src/modules/privacy/privacy.routes.ts"), "utf8",
);
const PROCESSOR_DOC = readFileSync(join(ROOT, "docs/dpdpa/processor-dpa-checklist.md"), "utf8");

/** The column lists passed to the query helpers. */
function selectedColumns(): string[] {
    return [...SUMMARY_SRC.matchAll(/"([a-z0-9_]+(?:,\s*[a-z0-9_]+)+)"/g)]
        .flatMap((m) => m[1].split(",").map((c) => c.trim()));
}

describe("the summary answers DPDPA s.11", () => {
    // s.11(1)(a) is a right to a SUMMARY of the personal data being processed,
    // not a copy of it. Counting in the database rather than fetching rows is
    // what makes it a summary — and is why there is no file to leak.
    it("counts in the database rather than shipping rows", () => {
        expect(SUMMARY_SRC).toMatch(/count:\s*"exact",\s*head:\s*true/);
    });

    // s.11(1)(b) — the identities of the processors the data is shared with.
    // This is the half no export of the rider's OWN rows could ever satisfy,
    // because the answer is not in their rows. It is the reason the summary
    // replaced the download rather than sitting beside it.
    it("names every processor the data is shared with", () => {
        expect(RECIPIENTS.length).toBeGreaterThan(0);
        for (const recipient of RECIPIENTS) {
            expect(recipient.receives.length, `${recipient.name} says nothing about what it gets`)
                .toBeGreaterThan(10);
            expect(recipient.why.length, `${recipient.name} says nothing about why`)
                .toBeGreaterThan(10);
        }
    });

    // The recipients list is maintained by hand because it is not derivable
    // from any table. That makes drift the risk: a processor added to the
    // checklist and not here is a rider told an incomplete truth.
    it("keeps the recipients list in step with the processor checklist", () => {
        for (const name of ["Supabase", "Razorpay", "MSG91", "Expo Push"]) {
            expect(
                RECIPIENTS.some((r) => r.name === name),
                `${name} is in processor-dpa-checklist.md but not in RECIPIENTS`,
            ).toBe(true);
            expect(PROCESSOR_DOC).toContain(name);
        }
    });

    it("tells the rider how long each category is kept", () => {
        expect(SUMMARY_SRC).toContain("retention");
        expect(SUMMARY_SRC).toContain("RETENTION_POLICIES");
    });

    it("states what is deliberately not held", () => {
        expect(SUMMARY_SRC).toContain("NOT_HELD");
        expect(SUMMARY_SRC).toMatch(/last four characters/);
        expect(SUMMARY_SRC).toMatch(/Other people's personal data/);
    });
});

describe("the summary leaks nothing it should not", () => {
    it("selects no storage path", () => {
        const cols = selectedColumns();
        expect(cols).not.toContain("front_storage_path");
        expect(cols).not.toContain("back_storage_path");
        expect(cols).not.toContain("photo_storage_path");
    });

    // The full number IS stored — encrypted, with a blind index beside it — so
    // this is not hypothetical. Handing back either column would put a
    // decryptable Aadhaar number on a screen.
    it("selects only the last-four form of an identity number", () => {
        const cols = selectedColumns();
        expect(cols).toContain("document_number_last4");
        expect(cols).not.toContain("document_number_encrypted");
        expect(cols).not.toContain("document_number_hmac");
    });

    it("selects no push token or session material", () => {
        const cols = selectedColumns();
        expect(cols).not.toContain("push_token");
        expect(cols).not.toContain("access_token");
        expect(cols).not.toContain("refresh_token");
    });

    // Access is the rider's right to THEIR data. Satisfying it must not
    // disclose the staff member who reviewed their KYC.
    it("does not name the staff who accessed the record", () => {
        expect(SUMMARY_SRC).not.toMatch(/pii_access_log[\s\S]{0,200}actor_user_id/);
    });

    // Every count is scoped to one rider. There is no helper here that takes a
    // table and no filter.
    it("scopes every read to the rider", () => {
        expect(SUMMARY_SRC).toMatch(/async function countRows\([\s\S]*?\.eq\(column, userId\)/);
        expect(SUMMARY_SRC).toMatch(/async function ownIds\([\s\S]*?\.eq\("user_id", userId\)/);
    });
});

describe("the summary covers every user-linked area of the product", () => {
    const CATEGORIES = [
        "user_addresses",
        "user_related_persons",
        "kyc_documents",
        "consent_records",
        "data_principal_requests",
        "bookings",
        "rentals",
        "invoices",
        "refunds",
        "support_tickets",
        "notification_messages",
        "pii_access_log",
    ];

    it("counts each one", () => {
        for (const table of CATEGORIES) {
            expect(SUMMARY_SRC, `the summary has no category for "${table}"`)
                .toContain(`"${table}"`);
        }
    });

    // deposits hang off a SUBSCRIPTION and rental_feedback off a RENTAL. A
    // count filtered on user_id against either does not come back empty, it
    // ERRORS — which is how four sections of the old export went silently
    // missing. The parent ids have to be resolved first.
    it("reaches the tables that have no user_id of their own", () => {
        expect(SUMMARY_SRC).toContain("ownIds");
        expect(SUMMARY_SRC).toMatch(/countByParent\("deposits",\s*"subscription_id"/);
        expect(SUMMARY_SRC).toMatch(/countByParent\("rental_feedback",\s*"rental_id"/);
    });

    it("is loud when a category cannot be read", () => {
        expect(SUMMARY_SRC).toContain("CATEGORY MISSING FROM A RIGHTS SUMMARY");
    });
});

describe("the export is gone, not merely unlinked", () => {
    // A removed feature that leaves its endpoint mounted is not removed. The
    // bundle was the single largest PII artefact the system produced.
    it("mounts no export route", () => {
        expect(ROUTES_SRC).not.toMatch(/"\/export"/);
        expect(ROUTES_SRC).not.toContain("/export/:id/url");
        expect(ROUTES_SRC).not.toContain("/users/:userId/export");
    });

    it("mounts the summary in its place", () => {
        expect(ROUTES_SRC).toContain('riderPrivacyRouter.get("/summary"');
        expect(ROUTES_SRC).toContain("/users/:userId/summary");
    });

    // Reading someone else's record still needs the dedicated permission it
    // always needed. The action key stayed "export" because that is what is
    // seeded and granted; what it gates is now a read.
    it("still gates the staff path behind its own permission", () => {
        const staffRoute = ROUTES_SRC.slice(ROUTES_SRC.indexOf("/users/:userId/summary") - 400);
        expect(staffRoute).toMatch(/requireAction\("privacy",\s*"export"\)/);
    });

    it("leaves no module able to write a bundle to storage", () => {
        expect(() => readFileSync(
            join(__dirname, "../src/modules/privacy/privacy.export.ts"), "utf8",
        )).toThrow();
    });
});
