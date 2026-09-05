import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    ERASED_CHILD_TABLES, ERASED_USER_COLUMNS, RETAINED_TABLES,
} from "../src/modules/privacy/privacy.erasure";

const MIGRATIONS = join(__dirname, "../../../supabase/v2/migrations");
const RETENTION_SQL = readFileSync(
    join(MIGRATIONS, "20260819102600_operational_functions.sql"), "utf8",
);
const USERS_SERVICE = readFileSync(
    join(__dirname, "../src/modules/users/users.service.ts"), "utf8",
);
const COMPLIANCE_SQL = readFileSync(
    join(MIGRATIONS, "20260819101800_compliance.sql"), "utf8",
);

/** The anonymise_user() body, isolated from the rest of the migration. */
const ANONYMISE_FN = RETENTION_SQL.slice(
    RETENTION_SQL.indexOf("create or replace function public.anonymise_user"),
);

/**
 * Columns on `users` the API actually reads back to a caller. Parsed from
 * PROFILE_SELECT rather than hardcoded, so adding a column to that select
 * — which is what makes it reachable by a rider or a staff member — is what
 * this suite notices.
 *
 * The select embeds child tables now, so the parenthesised embed bodies are
 * stripped first: `rider_profiles(kyc_status)` contributes the embed, not a
 * column named `kyc_status`. Those tables have their own erasure treatment,
 * asserted separately below.
 */
function profileColumns(): string[] {
    const start = USERS_SERVICE.indexOf("const PROFILE_SELECT = `");
    const block = USERS_SERVICE.slice(
        start + "const PROFILE_SELECT = `".length,
        USERS_SERVICE.indexOf("`;", start),
    );
    return block
        .replace(/[a-z_]+\([^)]*\)/g, "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
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
    // The role is account state, not data about who the person is.
    "role",
    "status",
    // Operator-assigned identifier for staff/admin accounts, not data about
    // who the person is — same category as `id`.
    "staff_code",
    // Security/session metadata, not personal data — same category as
    // created_at/updated_at.
    "last_login_at",
    "must_change_password",
    // Which of the app's 3 shipped languages the rider's UI renders in — a
    // display preference, not data ABOUT the person, and not something a
    // rider would expect erased along with their name and documents. Erasing
    // it would also silently drop a still-usable (now-anonymous) account back
    // into English mid-session for no compliance reason. See the rationale in
    // supabase/v2/migrations/20260905100000_user_preferred_language.sql.
    "preferred_language",
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

    // The nominee is no longer four columns on the rider — it is a row in
    // `user_related_persons`, alongside the emergency contact. Both are third
    // parties who never dealt with us directly, so the rider's erasure has to
    // take them with it: a DELETE, not four nulls.
    it("deletes the nominee and emergency contact, which are third parties' data", () => {
        expect(Object.keys(ERASED_CHILD_TABLES)).toContain("user_related_persons");
        expect(ANONYMISE_FN)
            .toMatch(/delete\s+from\s+public\.user_related_persons\s+where\s+user_id/i);
    });

    it("empties every table in ERASED_CHILD_TABLES", () => {
        for (const table of Object.keys(ERASED_CHILD_TABLES)) {
            expect(ANONYMISE_FN, `anonymise_user() never clears ${table}`)
                .toMatch(new RegExp(`delete\\s+from\\s+public\\.${table}\\b`, "i"));
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

    // `kyc_documents` rows are KEPT and scrubbed, not deleted — the images
    // are removed from storage by the caller, and the row survives so the
    // verification history remains auditable without the identity in it.
    it("destroys the identity numbers rather than leaving them encrypted", () => {
        for (const col of [
            "document_number_encrypted", "document_number_hmac",
            "document_number_last4", "encryption_key_version",
        ]) {
            expect(ANONYMISE_FN, `anonymise_user() never clears kyc_documents.${col}`)
                .toMatch(new RegExp(`\\b${col}\\s*=\\s*null`));
        }
    });

    it("clears the pointers to the document images", () => {
        expect(ANONYMISE_FN).toMatch(/front_storage_path\s*=\s*''/);
        expect(ANONYMISE_FN).toMatch(/back_storage_path\s*=\s*null/);
    });
});

describe("erasure request row survives the account", () => {
    // The request is the evidence that the erasure was asked for and lawful.
    // Cascading it away with the account would destroy exactly the record
    // needed to show the erasure was legitimate.
    it("references users with on delete restrict, not cascade", () => {
        const table = COMPLIANCE_SQL.slice(
            COMPLIANCE_SQL.indexOf("create table public.data_principal_requests"),
        );
        const fk = table.slice(table.indexOf("user_id")).split("\n")[0];
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

describe("ERASED_CHILD_TABLES documents what each holds", () => {
    it("has a non-empty description per table", () => {
        for (const [table, held] of Object.entries(ERASED_CHILD_TABLES)) {
            expect(held.length, `${table} does not say what it holds`).toBeGreaterThan(10);
        }
    });

    // A table cannot be both emptied and retained.
    it("does not overlap RETAINED_TABLES", () => {
        for (const table of Object.keys(ERASED_CHILD_TABLES)) {
            expect(Object.keys(RETAINED_TABLES)).not.toContain(table);
        }
    });
});
