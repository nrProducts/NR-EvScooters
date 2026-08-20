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
    // Every one of these is (actor, subject): a row that records both WHOSE
    // data it concerns and WHO acted on it. That shape is what produces two
    // foreign keys to `users`, and it is why the list is mostly compliance
    // and workflow tables.
    { child: "audit_logs", parent: "users" },              // actor + target
    { child: "consent_records", parent: "users" },         // rider + staff recorder
    { child: "damage_disputes", parent: "users" },         // raised_by + resolved_by
    { child: "data_principal_requests", parent: "users" }, // rider + assignee
    { child: "kyc_documents", parent: "users" },           // rider + verifier
    { child: "maintenance_tickets", parent: "users" },     // reporter + triager
    { child: "pii_access_log", parent: "users" },          // actor + target
    { child: "rental_returns", parent: "users" },          // approver + inspector + rejecter
    { child: "support_tickets", parent: "users" },         // rider + assignee
    { child: "swap_stations", parent: "users" },           // created_by + updated_by
    { child: "user_permission_overrides", parent: "users" }, // subject + granter

    // Not about people: a temp-vehicle swap records the hub the scooter came
    // from and the one it went back to.
    { child: "rental_vehicle_assignments", parent: "hubs" },

    // Two FKs to the same VIEW, not the same table: `v_subscription_current_period`
    // is reachable through both subscription_id and subscription_period_id.
    // PostgREST is ambiguous about views for exactly the same reason.
    { child: "invoices", parent: "v_subscription_current_period" },
    { child: "subscription_adjustments", parent: "v_subscription_current_period" },
];

/*
 * Pairs that LEFT this list, and why it matters that they did:
 *
 *   bookings → users        `cancelled_by` moved to `booking_cancellations`
 *   rentals  → users        the return workflow moved to `rental_returns`
 *   damages  → users        split into incidents + damages + damage_disputes
 *
 * Each of those had a mandatory `!fkey` disambiguator on every embed. Those
 * hints are now WRONG rather than merely unnecessary — they name constraints
 * that no longer exist — so removing them was not tidying.
 */

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

    /**
     * requireAuth is the highest blast radius in the codebase: an ambiguous
     * embed here fails every authenticated request in both apps at once.
     *
     * It no longer NEEDS a disambiguator, and that is the assertion. The two
     * embeds it used to hand-qualify are gone: the role is a column on
     * `users`, and capabilities are permissions read through a view. What is
     * left — `rider_profiles` — has exactly one foreign key back, so naming a
     * constraint here would be naming one that may not stay unique.
     *
     * The check is that requireAuth touches no table on the ambiguous list at
     * all, which is stronger than checking it spells one hint correctly.
     */
    it("keeps the auth middleware clear of every ambiguous pair", () => {
        const src = readFileSync(join(__dirname, "../src/middleware/auth.middleware.ts"), "utf8");
        for (const { child, parent } of AMBIGUOUS_PAIRS) {
            expect(src, `requireAuth embeds ${child}, which has several FKs to ${parent}`)
                .not.toMatch(new RegExp(String.raw`\b${child}\s*\(`));
        }
        // The permission read goes through the view, which resolves the whole
        // question rather than disambiguating it.
        expect(src).toContain("v_user_effective_permissions");
    });
});
