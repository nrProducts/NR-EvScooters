import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const EXPORT_SRC = readFileSync(
    join(__dirname, "../src/modules/privacy/privacy.export.ts"), "utf8",
);

/** The column lists passed to the query helpers, one per section. */
function selectedColumns(): string[] {
    return [...EXPORT_SRC.matchAll(/"([a-z0-9_]+(?:,\s*[a-z0-9_]+)+)"/g)]
        .flatMap((m) => m[1].split(",").map((c) => c.trim()));
}

describe("the export bundle leaks nothing it should not", () => {
    // A rider can forward this file to anyone. A signed storage path in it is
    // a link to their Aadhaar scan that outlives their control of the file.
    it("selects no storage path", () => {
        const cols = selectedColumns();
        expect(cols).not.toContain("front_storage_path");
        expect(cols).not.toContain("back_storage_path");
        expect(cols).not.toContain("photo_storage_path");
        expect(cols).not.toContain("export_storage_path");
    });

    // The full number IS stored now — encrypted, with a blind index beside
    // it — so this stopped being a hypothetical. Handing back either column
    // would put a decryptable Aadhaar number in a file the rider can forward
    // to anyone.
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
    // disclose the staff member who reviewed their KYC, or the rider who
    // referred them.
    it("does not select the names of other people", () => {
        expect(EXPORT_SRC).not.toMatch(/pii_access_log[\s\S]{0,200}actor_user_id.*full_name/);
        // The referral sections are gone with the referral tables, and with
        // them the one place the bundle could have disclosed another rider's
        // id. Nothing replaced them; nothing should.
        expect(EXPORT_SRC).not.toContain('"referrals"');
    });

    it("does not select internal staff notes on requests", () => {
        const requestsSection = EXPORT_SRC.slice(
            EXPORT_SRC.indexOf('many("data_principal_requests"'),
            EXPORT_SRC.indexOf('many("data_principal_requests"') + 220,
        );
        expect(requestsSection).not.toContain("resolution_notes");
        expect(requestsSection).not.toContain("assigned_to_user_id");
        expect(requestsSection).not.toContain("export_storage_path");
    });
});

describe("the export bundle covers what it claims to", () => {
    // The three new sections are the identity split surfacing: the address,
    // the nominee/emergency contact and the KYC state each left `users` for
    // their own table, and a bundle that only read `users` would silently stop
    // returning them.
    const SECTIONS = [
        "profile",
        "addresses",
        "nominee_and_emergency_contact",
        "rider_profile",
        "identity_documents",
        "current_consents",
        "consent_history",
        "privacy_requests",
        "bookings",
        "rentals",
        "invoices",
        "deposits",
        "refunds",
        "support_tickets",
        "rental_feedback",
        "notifications",
        "staff_access_to_your_data",
    ];

    it("includes every user-linked area of the product", () => {
        for (const section of SECTIONS) {
            expect(EXPORT_SRC, `bundle is missing the "${section}" section`)
                .toMatch(new RegExp(`\\b${section}[,:]`));
        }
    });

    // A rider handed a JSON file with no explanation cannot exercise the
    // correction right meaningfully, which is what access exists to enable.
    it("explains what was deliberately left out", () => {
        expect(EXPORT_SRC).toContain("not_included");
        expect(EXPORT_SRC).toMatch(/Other people's personal data/);
        expect(EXPORT_SRC).toMatch(/last four characters/);
    });
});

describe("export storage", () => {
    it("writes to the private data-exports bucket", () => {
        expect(EXPORT_SRC).toContain('EXPORT_BUCKET = "data-exports"');
    });

    it("scopes every object under the rider's own id", () => {
        expect(EXPORT_SRC).toMatch(/const path = `\$\{userId\}\/\$\{requestId\}\.json`/);
    });

    it("logs a count rather than the paths when removal fails", () => {
        // Paths embed the user id; a failure log is not a place to put one.
        const removeFn = EXPORT_SRC.slice(EXPORT_SRC.indexOf("export async function removeExportObjects"));
        expect(removeFn).toContain("paths: real.length");
        expect(removeFn).not.toMatch(/error.*paths: real[^.]/);
    });

    // Every query helper is keyed by the rider. There must be no path that
    // takes a table and no filter.
    it("scopes every query by a user column", () => {
        expect(EXPORT_SRC).toMatch(/async function one\([\s\S]*?\.eq\("id", userId\)/);
        expect(EXPORT_SRC).toMatch(/async function oneBy\([\s\S]*?\.eq\(column, userId\)/);
        expect(EXPORT_SRC).toMatch(/async function manyBy\([\s\S]*?\.eq\(column, userId\)/);
    });
});

/**
 * Guards the bug that made four sections of every export silently empty.
 *
 * A child table with no user_id does not return nothing when filtered by one
 * — it returns HTTP 400, which the bundle's degradation turned into
 * `{ unavailable: true }`. A rider exercising their access right received
 * "this section could not be read" in place of their financial records, and
 * nothing surfaced it.
 *
 * WHICH tables those are changed with the schema. Deposits hang off a
 * SUBSCRIPTION now, and rental_feedback off a RENTAL; refunds gained a
 * user_id and can be queried directly. Damages are not in the bundle at all —
 * they reach the rider through the settlement.
 */
describe("parent-keyed tables are not queried by user_id", () => {
    const PARENT_KEYED = ["deposits", "rental_feedback"];

    it("uses the byParent helper, never many()", () => {
        for (const table of PARENT_KEYED) {
            expect(
                EXPORT_SRC,
                `${table} has no user_id column — query it with byParent(), not many()`,
            ).not.toContain(`many("${table}"`);
        }
    });

    it("resolves the parent ids before querying them", () => {
        expect(EXPORT_SRC).toContain("ownIds");
        expect(EXPORT_SRC).toMatch(/byParent\("deposits",[\s\S]{0,200}"subscription_id"/);
        expect(EXPORT_SRC).toMatch(/byParent\("rental_feedback",[\s\S]{0,120}"rental_id"/);
    });

    // refunds gained a user_id, so it moves the other way — out of the
    // parent-keyed set and into a direct query.
    it("queries refunds directly, now that it has a user_id", () => {
        expect(EXPORT_SRC).toMatch(/many\("refunds"/);
    });

    // The same class of silent failure, one level down: a column list naming
    // fields the table does not have fails exactly like a missing user_id.
    it("selects invoice columns that exist", () => {
        const invoices = EXPORT_SRC.slice(
            EXPORT_SRC.indexOf('many("invoices"'),
            EXPORT_SRC.indexOf('many("invoices"') + 260,
        );
        expect(invoices).toContain("total_amount");
        expect(invoices).toContain("issued_on");
        // All three were columns on the old invoices table and are gone.
        expect(invoices).not.toContain("amount_due");
        expect(invoices).not.toContain("payment_status");
        expect(invoices).not.toContain("due_date");
    });

    // The fallback must be loud. It was warn-level, which is how a permanent
    // bug hid behind a mechanism meant for transient blips.
    it("logs a missing export section at error level", () => {
        expect(EXPORT_SRC).toContain("SECTION MISSING FROM A RIGHTS EXPORT");
    });
});
