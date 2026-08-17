import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ERASED_USER_COLUMNS, RETAINED_TABLES } from "../src/modules/privacy/privacy.erasure";

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const RETENTION_SQL = readFileSync(join(MIGRATIONS, "20260814100500_dpdpa_retention.sql"), "utf8");
const USERS_SERVICE = readFileSync(
    join(__dirname, "../src/modules/users/users.service.ts"), "utf8",
);
const RIGHTS_SQL = readFileSync(
    join(MIGRATIONS, "20260814100300_dpdpa_rights_requests.sql"), "utf8",
);

/** The anonymise_user() body, isolated from the rest of the migration. */
const ANONYMISE_FN = RETENTION_SQL.slice(
    RETENTION_SQL.indexOf("create or replace function public.anonymise_user"),
);

/**
 * Columns on `users` the API actually reads back to a caller. Parsed from
 * PROFILE_COLUMNS rather than hardcoded, so adding a column to that select
 * — which is what makes it reachable by a rider or a staff member — is what
 * this suite notices.
 */
function profileColumns(): string[] {
    const block = USERS_SERVICE.slice(
        USERS_SERVICE.indexOf("const PROFILE_COLUMNS = `") + 25,
        USERS_SERVICE.indexOf("`;", USERS_SERVICE.indexOf("const PROFILE_COLUMNS = `")),
    );
    return block.split(",").map((c) => c.trim()).filter(Boolean);
}

/** Columns that are identifiers or state, not personal data about the rider. */
const NOT_PERSONAL_DATA = new Set([
    "id",
    "account_status",
    "kyc_status",
    "profile_completed",
    "created_at",
    "updated_at",
    "deleted_at",
    "erased_at",
    "erasure_request_id",
    "status_reason",
    "status_changed_at",
    // Country and state are coarse enough to be treated as non-identifying in
    // docs/dpdpa/data-inventory.md. If that judgement changes, this set and
    // REDACT_KEYS in common/mask.ts both have to change with it.
    "country",
    "state",
    // Operator-assigned identifier for staff/admin accounts, not data about
    // who the person is — same category as `id`.
    "staff_code",
    // Security/session metadata, not personal data — same category as
    // created_at/updated_at.
    "last_login_at",
    "must_change_password",
]);

describe("anonymise_user covers every personal column the API exposes", () => {
    // THE test for this feature. A future `ALTER TABLE users ADD COLUMN
    // aadhaar_name` plus a line in PROFILE_COLUMNS would otherwise ship a
    // column that erasure silently misses — and nobody would find out until
    // someone asked what we still held about them.
    it("clears or is exempted from every column in PROFILE_COLUMNS", () => {
        const unhandled = profileColumns().filter(
            (col) =>
                !NOT_PERSONAL_DATA.has(col) &&
                !(ERASED_USER_COLUMNS as readonly string[]).includes(col),
        );
        expect(
            unhandled,
            `These columns are returned by the API but not erased. Add them to ` +
            `ERASED_USER_COLUMNS and to anonymise_user(), or to NOT_PERSONAL_DATA ` +
            `with a reason: ${unhandled.join(", ")}`,
        ).toEqual([]);
    });

    it("erases every nominee column, which is a third party's data", () => {
        for (const col of ["nominee_full_name", "nominee_relationship", "nominee_phone", "nominee_email"]) {
            expect(ERASED_USER_COLUMNS as readonly string[]).toContain(col);
        }
    });

    it("has a SQL assignment for every column in ERASED_USER_COLUMNS", () => {
        for (const col of ERASED_USER_COLUMNS) {
            expect(ANONYMISE_FN, `anonymise_user() never clears ${col}`)
                .toMatch(new RegExp(`\\b${col}\\s*=`));
        }
    });

    it("nulls the contact fields rather than blanking them, so they are freed for reuse", () => {
        expect(ANONYMISE_FN).toMatch(/phone\s*=\s*null/);
        expect(ANONYMISE_FN).toMatch(/email\s*=\s*null/);
    });

    it("sets erased_at, which is what distinguishes erasure from deactivation", () => {
        expect(ANONYMISE_FN).toMatch(/erased_at\s*=\s*now\(\)/);
    });
});

describe("anonymise_user leaves statutorily retained data alone", () => {
    // Erasure severs the link to a living identity; it does not destroy the
    // transaction. If someone "improves" erasure by deleting invoices, this
    // fails — which is the point.
    it("issues no delete against a retained table", () => {
        for (const table of Object.keys(RETAINED_TABLES)) {
            expect(
                ANONYMISE_FN,
                `anonymise_user() deletes from ${table} (${RETAINED_TABLES[table]})`,
            ).not.toMatch(new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, "i"));
        }
    });

    it("issues no update against the accountability tables", () => {
        for (const table of ["audit_logs", "pii_access_log", "consent_records"]) {
            expect(ANONYMISE_FN).not.toMatch(
                new RegExp(`update\\s+public\\.${table}\\b`, "i"),
            );
        }
    });

    it("does delete the identity documents, which are not retained", () => {
        expect(ANONYMISE_FN).toMatch(/delete\s+from\s+public\.user_documents/i);
    });

    it("clears otp attempts, which are keyed by phone and not by user id", () => {
        expect(ANONYMISE_FN).toMatch(/delete\s+from\s+public\.auth_otp_attempts/i);
        // The phone has to be captured before step 1 nulls it, or this deletes
        // nothing at all.
        expect(ANONYMISE_FN.indexOf("select phone into v_phone"))
            .toBeLessThan(ANONYMISE_FN.indexOf("update public.users"));
    });
});

describe("erasure request row survives the account", () => {
    // The request is the evidence that the erasure was asked for and lawful.
    // Cascading it away with the account would destroy exactly the record
    // needed to show the erasure was legitimate.
    it("references users with on delete restrict, not cascade", () => {
        const fk = RIGHTS_SQL.slice(
            RIGHTS_SQL.indexOf("user_id            uuid not null references"),
        ).split("\n")[0];
        expect(fk).toContain("on delete restrict");
    });
});

describe("RETAINED_TABLES documents a reason for every entry", () => {
    it("has a non-empty justification per table", () => {
        for (const [table, reason] of Object.entries(RETAINED_TABLES)) {
            expect(reason.length, `${table} has no stated reason`).toBeGreaterThan(10);
        }
    });
});
