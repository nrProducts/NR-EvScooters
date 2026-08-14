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
        expect(cols).not.toContain("storage_path");
        expect(cols).not.toContain("back_storage_path");
        expect(cols).not.toContain("profile_photo_url");
        expect(cols).not.toContain("export_object_path");
    });

    // There is no full number to export — but if one is ever reintroduced,
    // this is where it would silently start being handed out.
    it("selects only the last-four form of an identity number", () => {
        const cols = selectedColumns();
        expect(cols).toContain("doc_number_last4");
        expect(cols).not.toContain("doc_number");
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
        expect(EXPORT_SRC).not.toMatch(/pii_access_log[\s\S]{0,200}actor_id.*full_name/);
        // referrals is filtered BY referrer_id/referee_id (both are this
        // rider), but must never SELECT them — that would hand over the other
        // rider's id.
        for (const m of EXPORT_SRC.matchAll(/manyBy\("referrals",\s*"([^"]+)"/g)) {
            expect(m[1]).not.toContain("referrer_id");
            expect(m[1]).not.toContain("referee_id");
        }
    });

    it("does not select internal staff notes on requests", () => {
        const requestsSection = EXPORT_SRC.slice(
            EXPORT_SRC.indexOf('many("data_principal_requests"'),
            EXPORT_SRC.indexOf('many("data_principal_requests"') + 220,
        );
        expect(requestsSection).not.toContain("resolution_notes");
        expect(requestsSection).not.toContain("assigned_to");
        expect(requestsSection).not.toContain("ticket_ref");
    });
});

describe("the export bundle covers what it claims to", () => {
    const SECTIONS = [
        "profile",
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
        "referrals_you_were_referred_by",
        "referrals_you_made",
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
        expect(EXPORT_SRC).toMatch(/async function manyBy\([\s\S]*?\.eq\(column, userId\)/);
    });
});

/**
 * Guards the bug that made four sections of every export silently empty.
 *
 * deposits, refunds and damages have NO user_id column — they hang off a
 * booking. Filtering them by user_id does not return nothing, it returns
 * HTTP 400, which the bundle's degradation turned into
 * `{ unavailable: true }`. A rider exercising their access right received
 * "this section could not be read" in place of their financial records, and
 * nothing surfaced it.
 */
describe("booking-keyed tables are not queried by user_id", () => {
    const BOOKING_KEYED = ["deposits", "refunds", "damages"];

    it("uses the byBooking helper, never many()", () => {
        for (const table of BOOKING_KEYED) {
            expect(
                EXPORT_SRC,
                `${table} has no user_id column — query it with byBooking(), not many()`,
            ).not.toContain(`many("${table}"`);
        }
    });

    it("resolves the rider's booking ids before querying them", () => {
        expect(EXPORT_SRC).toContain("ownBookingIds");
        expect(EXPORT_SRC).toMatch(/byBooking\("deposits"/);
        expect(EXPORT_SRC).toMatch(/byBooking\("refunds"/);
    });

    // invoices DOES have user_id, but had the wrong column names
    // (`amount`/`issued_at` instead of `amount_due`/`due_date`), which failed
    // the same silent way.
    it("selects invoice columns that exist", () => {
        const invoices = EXPORT_SRC.slice(
            EXPORT_SRC.indexOf('many("invoices"'),
            EXPORT_SRC.indexOf('many("invoices"') + 240,
        );
        expect(invoices).toContain("amount_due");
        expect(invoices).not.toMatch(/"[^"]*amount,/);
        expect(invoices).not.toContain("issued_at");
    });

    // The fallback must be loud. It was warn-level, which is how a permanent
    // bug hid behind a mechanism meant for transient blips.
    it("logs a missing export section at error level", () => {
        expect(EXPORT_SRC).toContain("SECTION MISSING FROM A RIGHTS EXPORT");
        expect(EXPORT_SRC).not.toMatch(/console\.warn\("\[privacy\.export\] section unavailable/);
    });
});
