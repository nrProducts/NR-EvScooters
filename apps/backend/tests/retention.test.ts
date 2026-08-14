import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEVER_PURGED, RETENTION_POLICIES } from "../src/modules/privacy/retention.constants";

const ROOT = join(__dirname, "../../..");
const RETENTION_SQL = readFileSync(
    join(ROOT, "supabase/migrations/20260814100500_dpdpa_retention.sql"), "utf8",
);
const CRON_SQL = readFileSync(
    join(ROOT, "supabase/migrations/20260814100600_dpdpa_retention_cron.sql"), "utf8",
);
const PURGE_FN = readFileSync(
    join(ROOT, "supabase/functions/data-retention-purge/index.ts"), "utf8",
);

/** (category, retain_days, action) parsed out of the seeded VALUES list. */
function seededPolicies(): { category: string; retainDays: number; action: string }[] {
    const block = RETENTION_SQL.slice(
        RETENTION_SQL.indexOf("insert into public.retention_policies"),
        RETENTION_SQL.indexOf("on conflict (category) do nothing"),
    );
    return [...block.matchAll(/\('([a-z_]+)',[\s\S]*?(\d+),\s*'(delete|anonymise|redact|never)'/g)]
        .map((m) => ({ category: m[1], retainDays: Number(m[2]), action: m[3] }));
}

describe("retention constants match the migration", () => {
    // The database is the source of truth at run time, so ops can change a
    // period without a deploy. This duplication is what makes that safe: a
    // change in one place that is not made in the other fails the build
    // instead of drifting silently for months.
    it("declares exactly the same categories", () => {
        expect(seededPolicies().map((p) => p.category).sort())
            .toEqual(RETENTION_POLICIES.map((p) => p.category).sort());
    });

    it("agrees on every period and action", () => {
        const seeded = new Map(seededPolicies().map((p) => [p.category, p]));
        for (const policy of RETENTION_POLICIES) {
            const row = seeded.get(policy.category);
            expect(row, `${policy.category} is missing from the migration`).toBeDefined();
            expect(row!.retainDays, `${policy.category} period differs`).toBe(policy.retainDays);
            expect(row!.action, `${policy.category} action differs`).toBe(policy.action);
        }
    });

    it("has a positive period for every category", () => {
        for (const p of RETENTION_POLICIES) {
            expect(p.retainDays, p.category).toBeGreaterThan(0);
        }
    });
});

describe("financial records are never purged", () => {
    it("is declared 'never' in both places", () => {
        expect(NEVER_PURGED).toContain("financial_records");
        const seeded = seededPolicies().find((p) => p.category === "financial_records");
        expect(seeded?.action).toBe("never");
    });

    // Belt and braces: even a mis-edited policy row cannot make the job
    // delete a financial record, because 'never' short-circuits before the
    // handler lookup.
    it("is short-circuited by the job before any handler runs", () => {
        expect(PURGE_FN).toMatch(/if \(policy\.action === "never"\)[\s\S]{0,200}continue;/);
    });
});

describe("the purge job implements every enabled policy", () => {
    // A policy row that claims to be enforced but has no handler would purge
    // nothing while looking compliant — the worst outcome available here.
    it("has a handler for every category", () => {
        const handlerBlock = PURGE_FN.slice(
            PURGE_FN.indexOf("const HANDLERS"),
            PURGE_FN.indexOf("// Erasure execution"),
        );
        for (const policy of RETENTION_POLICIES) {
            expect(handlerBlock, `no handler for "${policy.category}"`)
                .toMatch(new RegExp(`async ${policy.category}\\b`));
        }
    });

    it("reports loudly rather than silently skipping an unknown category", () => {
        expect(PURGE_FN).toContain("NO HANDLER");
        expect(PURGE_FN).toMatch(/policy has no handler; nothing was enforced/);
    });

    // The period for keeping identity documents after a rider leaves is
    // unresolved. Acting on a placeholder would destroy real documents on a
    // schedule nobody signed off.
    it("does not act on the unsettled kyc_former_customer period", () => {
        const handler = PURGE_FN.slice(
            PURGE_FN.indexOf("async kyc_former_customer"),
            PURGE_FN.indexOf("async inactive_accounts"),
        );
        expect(handler).toContain("return 0");
        expect(handler).not.toMatch(/\.delete\(\)|remove\(/);
    });
});

describe("append-only tables are purged through named functions only", () => {
    // The triggers block DELETE for the service role too, deliberately. The
    // only sanctioned exception is retention, through functions that suspend
    // the trigger for one statement and can be reviewed on their own.
    it("goes through an RPC rather than a direct delete", () => {
        for (const table of ["pii_access_log", "audit_logs", "consent_records"]) {
            expect(PURGE_FN).not.toMatch(
                new RegExp(`from\\("${table}"\\)[\\s\\S]{0,60}\\.delete\\(\\)`),
            );
        }
        expect(PURGE_FN).toContain('rpc("purge_pii_access_log"');
        expect(PURGE_FN).toContain('rpc("purge_audit_logs"');
        expect(PURGE_FN).toContain('rpc("purge_consent_records"');
    });

    it("re-enables every trigger in an exception handler", () => {
        // Leaving a trigger off after a failed delete would silently remove
        // the append-only guarantee and nobody would notice.
        const fns = ["purge_audit_logs", "purge_pii_access_log", "purge_consent_records"];
        for (const fn of fns) {
            const body = CRON_SQL.slice(
                CRON_SQL.indexOf(`create or replace function public.${fn}`),
                CRON_SQL.indexOf("$$;", CRON_SQL.indexOf(`create or replace function public.${fn}`)),
            );
            expect(body, `${fn} has no exception handler`).toContain("exception when others then");
            expect(body.match(/enable trigger/g)?.length, `${fn} re-enables only once`)
                .toBeGreaterThanOrEqual(2);
        }
    });

    it("only purges consent for accounts that are already erased", () => {
        const body = CRON_SQL.slice(CRON_SQL.indexOf("create or replace function public.purge_consent_records"));
        expect(body).toContain("u.erased_at is not null");
    });
});

describe("candidate selection is conservative", () => {
    it("never treats a rider with any transaction as abandoned", () => {
        const fn = CRON_SQL.slice(
            CRON_SQL.indexOf("create or replace function public.kyc_abandoned_user_ids"),
            CRON_SQL.indexOf("create or replace function public.inactive_user_ids"),
        );
        for (const table of ["bookings", "rentals", "invoices"]) {
            expect(fn, `abandoned check ignores ${table}`)
                .toMatch(new RegExp(`not exists[\\s\\S]{0,80}public\\.${table}`));
        }
    });

    it("never anonymises an account with a live obligation", () => {
        const fn = CRON_SQL.slice(CRON_SQL.indexOf("create or replace function public.inactive_user_ids"));
        expect(fn).toMatch(/r\.status = 'active'/);
        expect(fn).toMatch(/i\.status in \('issued', 'overdue'\)/);
        expect(fn).toMatch(/dpr\.status in \('open', 'in_progress', 'awaiting_principal'\)/);
    });

    // Anonymising a staff account would break the audit trail's actor names
    // and lock a colleague out of the console.
    it("never anonymises a staff account on inactivity", () => {
        const fn = CRON_SQL.slice(CRON_SQL.indexOf("create or replace function public.inactive_user_ids"));
        expect(fn).toMatch(/r\.name <> 'rider'/);
    });
});

describe("the job is scheduled", () => {
    it("runs daily, after the payment sweeps", () => {
        expect(CRON_SQL).toContain("'retention-purge-daily'");
        expect(CRON_SQL).toContain("'30 3 * * *'");
    });

    it("reads the service key from Vault rather than embedding it", () => {
        expect(CRON_SQL).toContain("vault.decrypted_secrets");
        expect(CRON_SQL).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    });
});
