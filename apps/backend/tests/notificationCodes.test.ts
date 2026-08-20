import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMITTED_NOTIFICATION_CODES } from "../src/types";

/**
 * Every code this application can emit must have a `notification_types` row.
 *
 * `notification_events.notification_type_code` and
 * `notification_messages.notification_type_code` are both
 * `FOREIGN KEY … REFERENCES notification_types(code) ON DELETE RESTRICT`. A
 * code with no row is therefore not a cosmetic gap — the insert fails, and
 * both write paths swallow the error:
 *
 *   `notifyUser`   catches and logs, so the rider's inbox is silently empty;
 *   `notify`       never reaches the insert at all, because `getRecipients`
 *                  returns zero recipients for an unknown code and the
 *                  empty-recipients guard returns first.
 *
 * That is how 20 unseeded codes and 7 bogus category names shipped together
 * without a single failing request. See docs/final-system-audit (C5, C6, L3).
 *
 * This test reads the SEED MIGRATIONS rather than the database on purpose: it
 * has to run in CI with no Supabase connection, and the migrations are what a
 * fresh environment will actually have. It is the coverage half of the
 * guarantee; `EmittedNotificationCode` is the spelling half.
 */

const MIGRATIONS_DIR = join(__dirname, "..", "..", "..", "supabase", "v2", "migrations");

/**
 * Pulls the first column out of every `('code', …)` tuple in an
 * `insert into public.notification_types … values …` statement.
 *
 * Deliberately dumb string scanning — a SQL parser here would be a second
 * thing to keep correct, and the seed files are hand-written in one shape.
 */
function seededCodes(): Set<string> {
    const codes = new Set<string>();

    for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"))) {
        const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

        // Each insert runs to the terminating semicolon.
        const inserts = sql.match(
            /insert\s+into\s+public\.notification_types[\s\S]*?;/gi,
        ) ?? [];

        for (const stmt of inserts) {
            for (const [, code] of stmt.matchAll(/\(\s*'([a-z0-9_]+)'\s*,/g)) {
                codes.add(code);
            }
        }
    }
    return codes;
}

describe("notification type codes", () => {
    const seeded = seededCodes();

    it("finds the seed migrations at all", () => {
        // Guards against the whole suite passing vacuously if the migrations
        // directory moves — an empty set would make every check below trivial.
        expect(seeded.size).toBeGreaterThan(20);
        expect(seeded.has("kyc_review_needed")).toBe(true);
    });

    it("seeds every code the application can emit", () => {
        const missing = EMITTED_NOTIFICATION_CODES.filter((c) => !seeded.has(c));
        expect(
            missing,
            `These codes are emitted by the backend but have no notification_types row, `
            + `so every notification carrying them fails its foreign key: ${missing.join(", ")}`,
        ).toEqual([]);
    });

    it("emits no code that is merely a category name", () => {
        // The seven values `notify()` used to pass as notification_type_code.
        // None was ever a catalogue code; all seven silently discarded the
        // notification. Named explicitly so a regression is unambiguous.
        const categories = [
            "booking", "cancellation", "damage", "kyc", "maintenance", "refund", "return",
        ];
        const offenders = categories.filter(
            (c) => (EMITTED_NOTIFICATION_CODES as readonly string[]).includes(c),
        );
        expect(offenders).toEqual([]);
    });
});
