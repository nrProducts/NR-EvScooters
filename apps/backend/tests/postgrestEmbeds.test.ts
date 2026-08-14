import { describe, expect, it } from "vitest";
import { readFileSync, globSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards against the failure that took the product down twice in one day.
 *
 * PostgREST resolves an embed only when there is exactly ONE foreign key
 * between the two tables. Where there are two or more it answers
 * 300 Multiple Choices (PGRST201) and the request never reaches Postgres —
 * so there is no database error to diagnose from, which is what made this
 * expensive to find both times.
 *
 * It bit twice because the ambiguity is DIRECTIONAL and the first fix only
 * covered one direction:
 *
 *   users   → user_roles   `user_roles(roles(name))`        (broke login)
 *   user_roles → users     `users!inner(kyc_status, ...)`   (broke the dashboard)
 *
 * Both are the same two tables and the same two foreign keys. So this test
 * checks BOTH directions, and derives the table list from the schema below
 * rather than from whichever call site happened to break.
 *
 * The correct forms are:
 *   user_roles!user_roles_user_id_fkey(roles(name))
 *   users!user_roles_user_id_fkey!inner(kyc_status, deleted_at)
 * — the disambiguator names the CONSTRAINT, so it is the same either way,
 * and `!inner` chains after it.
 */

/**
 * Every (child, parent) pair with more than one foreign key between them.
 *
 * Generated from the live schema with:
 *
 *   select conrelid::regclass, confrelid::regclass, count(*)
 *     from pg_constraint
 *    where contype='f' and connamespace='public'::regnamespace
 *    group by 1,2 having count(*) > 1;
 *
 * Re-run that after any migration that adds a foreign key. A new pair here
 * is not a warning — it means every existing embed between those two tables
 * has just silently broken.
 */
const AMBIGUOUS_PAIRS: ReadonlyArray<{ child: string; parent: string }> = [
    { child: "audit_logs", parent: "users" },
    { child: "battery_stations", parent: "users" },
    { child: "bookings", parent: "users" },
    { child: "consent_records", parent: "users" },
    { child: "damages", parent: "users" },
    { child: "data_principal_requests", parent: "users" },
    { child: "pii_access_log", parent: "users" },
    { child: "referrals", parent: "users" },
    // rentals.user_id (rider) + rentals.return_approved_by (staff), added by
    // 20260814110000_rental_return_approval.sql.
    { child: "rentals", parent: "users" },
    { child: "staff_permissions", parent: "users" },
    { child: "support_requests", parent: "users" },
    { child: "user_capabilities", parent: "users" },
    { child: "user_documents", parent: "users" },
    { child: "user_roles", parent: "users" },
    { child: "vehicle_maintenance", parent: "users" },
    { child: "vehicle_maintenance", parent: "vehicles" },
];

interface Offender {
    file: string;
    line: number;
    snippet: string;
}

/** PostgREST select strings, with the table they are selected FROM. */
function selectSites(): Array<{ file: string; from: string | null; select: string; line: number }> {
    const sites: Array<{ file: string; from: string | null; select: string; line: number }> = [];
    const root = join(__dirname, "..");

    for (const rel of globSync("src/**/*.ts", { cwd: root })) {
        const file = join(root, rel);
        const src = readFileSync(file, "utf8");

        for (const m of src.matchAll(/\.select\(\s*([`"'])([\s\S]*?)\1/g)) {
            const before = src.slice(0, m.index);
            // Nearest preceding .from("x") in the same file is the parent table.
            const froms = [...before.matchAll(/\.from\(\s*["'`]([a-z_]+)["'`]/g)];
            sites.push({
                file: rel,
                from: froms.length ? froms[froms.length - 1][1] : null,
                select: m[2],
                line: before.split("\n").length,
            });
        }
    }
    return sites;
}

/** A bare `table(` or `table!inner(` embed — i.e. one with no `!<fk>` before it. */
function hasBareEmbed(select: string, table: string): boolean {
    // Matches `table(` and `table!inner(` but NOT `table!some_fkey...(`.
    const bare = new RegExp(`(?<![!\\w.])${table}\\s*(?:!inner\\s*)?\\(`);
    return bare.test(select);
}

describe("PostgREST embeds between multi-FK tables are disambiguated", () => {
    const sites = selectSites();

    it("finds select sites to check (guards against the scanner silently matching nothing)", () => {
        expect(sites.length).toBeGreaterThan(20);
    });

    it("has no ambiguous embed in either direction", () => {
        const offenders: Offender[] = [];

        for (const site of sites) {
            for (const { child, parent } of AMBIGUOUS_PAIRS) {
                // Direction 1: selecting FROM the parent, embedding the child.
                //   .from("users").select("user_roles(...)")
                if (site.from === parent && hasBareEmbed(site.select, child)) {
                    offenders.push({
                        file: site.file, line: site.line,
                        snippet: `from ${parent} embedding ${child}`,
                    });
                }
                // Direction 2: selecting FROM the child, embedding the parent.
                //   .from("user_roles").select("users!inner(...)")
                if (site.from === child && hasBareEmbed(site.select, parent)) {
                    offenders.push({
                        file: site.file, line: site.line,
                        snippet: `from ${child} embedding ${parent}`,
                    });
                }
            }
        }

        expect(
            offenders,
            "Ambiguous PostgREST embed(s). These return 300 Multiple Choices at " +
            "runtime with no Postgres error to trace. Name the foreign key, e.g. " +
            "`users!user_roles_user_id_fkey!inner(...)`:\n" +
            offenders.map((o) => `  ${o.file}:${o.line} — ${o.snippet}`).join("\n"),
        ).toEqual([]);
    });

    // requireAuth is the highest blast radius in the codebase: an ambiguous
    // embed here fails every authenticated request in both apps at once.
    it("keeps the auth middleware explicitly disambiguated", () => {
        const src = readFileSync(join(__dirname, "../src/middleware/auth.middleware.ts"), "utf8");
        expect(src).toContain("user_roles!user_roles_user_id_fkey");
        expect(src).toContain("user_capabilities!user_capabilities_user_id_fkey");
    });
});
