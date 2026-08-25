import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEVER_PURGED, RETENTION_POLICIES } from "../src/modules/privacy/retention.constants";

const ROOT = join(__dirname, "../../..");
const V2 = join(ROOT, "supabase/v2/migrations");

const SEED_SQL = readFileSync(join(V2, "20260819102400_realtime_and_seed.sql"), "utf8");
const DROP_EXPORTS_SQL = readFileSync(
    join(V2, "20260825100000_drop_data_exports.sql"), "utf8",
);
const FUNCTIONS_SQL = readFileSync(join(V2, "20260819102600_operational_functions.sql"), "utf8");
const CRON_SQL = readFileSync(join(V2, "20260819102900_scheduled_jobs.sql"), "utf8");
const PURGE_FN = readFileSync(
    join(ROOT, "supabase/functions/data-retention-purge/index.ts"), "utf8",
);

/**
 * (category, retain_days, action) parsed out of the seeded VALUES lists.
 *
 * One file again. `data_exports` was added by a later migration and removed
 * by ...100000_drop_data_exports.sql when access requests stopped producing a
 * file — see the "the export policy is gone" block below, which asserts the
 * row does not come back.
 */
function seededPolicies(): { category: string; retainDays: number; action: string }[] {
    const blocks = [
        SEED_SQL.slice(
            SEED_SQL.indexOf("insert into public.retention_policies"),
            SEED_SQL.indexOf("insert into public.invoice_series"),
        ),
    ];
    return blocks.flatMap((block) => [
        ...block.matchAll(
            /'([a-z_]+)',\s*\n?\s*'[^']*',\s*\n?\s*(\d+),\s*\n?\s*'(delete|anonymise|redact|retain)'/g,
        ),
    ].map((m) => ({ category: m[1], retainDays: Number(m[2]), action: m[3] })));
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
    it("is declared 'retain' in both places", () => {
        expect(NEVER_PURGED).toContain("financial_records");
        const seeded = seededPolicies().find((p) => p.category === "financial_records");
        expect(seeded?.action).toBe("retain");
    });

    // Belt and braces: even a mis-edited policy row cannot make the job
    // delete a financial record, because 'retain' short-circuits before the
    // handler lookup.
    it("is short-circuited by the job before any handler runs", () => {
        expect(PURGE_FN).toMatch(/if \(policy\.action === "retain"\)[\s\S]{0,200}continue;/);
    });

    // The consent record is the evidence of the lawful basis for everything
    // that was done with a rider's data. Destroying it destroys the defence.
    it("keeps consent records and financial audit rows too", () => {
        expect(NEVER_PURGED).toContain("consent_records");
        expect(NEVER_PURGED).toContain("audit_logs_financial");
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
                .toMatch(new RegExp(`\\b${policy.category}\\(`));
        }
    });

    it("reports loudly rather than silently skipping an unknown category", () => {
        expect(PURGE_FN).toContain("NO HANDLER");
        expect(PURGE_FN).toMatch(/policy has no handler; nothing was enforced/);
    });

    // `auth_otp_attempts` has a policy row and no table. A handler returning 0
    // without saying why would read as "enforced" in every run summary from
    // here on — which is the same failure the NO HANDLER case guards against,
    // one level further in.
    it("says so out loud when a policy has no table behind it", () => {
        const handler = PURGE_FN.slice(
            PURGE_FN.indexOf("auth_otp_attempts()"),
            PURGE_FN.indexOf("notification_bodies("),
        );
        expect(handler).toMatch(/no table in this schema/);
        expect(handler).not.toMatch(/\.delete\(\)|remove\(/);
    });

    // Redaction blanks the words and keeps the row: the delivery record and
    // the read state are operational history, the message text is not.
    it("redacts notification bodies rather than deleting the messages", () => {
        const handler = PURGE_FN.slice(
            PURGE_FN.indexOf("async notification_bodies("),
            PURGE_FN.indexOf("async notification_events("),
        );
        expect(handler).toContain('"[redacted]"');
        expect(handler).not.toMatch(/\.delete\(\)/);
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

    /**
     * The escape hatch is transaction-local, which is what replaced
     * `alter table ... disable trigger`.
     *
     * That matters more than it looks. Disabling a trigger is a schema change
     * visible to every session, so a purge that failed between the disable
     * and the re-enable left the table mutable for everyone until someone
     * noticed. `set_config(..., true)` is scoped to the transaction and
     * cannot outlive it, so there is nothing to leak and no exception handler
     * to get wrong.
     */
    it("suspends the guard transaction-locally, not by altering the table", () => {
        for (const fn of ["purge_audit_logs", "purge_pii_access_log", "purge_consent_records"]) {
            const body = FUNCTIONS_SQL.slice(
                FUNCTIONS_SQL.indexOf(`create or replace function public.${fn}`),
                FUNCTIONS_SQL.indexOf("end $$;", FUNCTIONS_SQL.indexOf(`create or replace function public.${fn}`)),
            );
            expect(body, `${fn} does not set the purge-mode flag`)
                .toContain("set_config('app.purge_mode', 'on', true)");
            expect(body, `${fn} disables a trigger, which outlives its transaction`)
                .not.toMatch(/disable trigger/i);
        }
    });

    it("still blocks UPDATE on an append-only table, purge mode or not", () => {
        const guard = FUNCTIONS_SQL.slice(
            FUNCTIONS_SQL.indexOf("create or replace function public.trg_append_only"),
        );
        expect(guard).toMatch(/tg_op = 'DELETE'/);
    });
});

describe("candidate selection is conservative", () => {
    it("never treats a rider with a submitted document as abandoned", () => {
        const fn = FUNCTIONS_SQL.slice(
            FUNCTIONS_SQL.indexOf("create or replace function public.kyc_abandoned_user_ids"),
        );
        expect(fn).toMatch(/d\.submitted_at is null/);
        expect(fn).toMatch(/u\.erased_at is null/);
    });

    it("never anonymises a rider with a live subscription", () => {
        const fn = FUNCTIONS_SQL.slice(
            FUNCTIONS_SQL.indexOf("create or replace function public.inactive_user_ids"),
            FUNCTIONS_SQL.indexOf("create or replace function public.kyc_abandoned_user_ids"),
        );
        expect(fn).toMatch(/s\.status = 'active'/);
        expect(fn).toMatch(/not exists[\s\S]{0,120}public\.subscriptions/);
    });

    // Anonymising a staff account would break the audit trail's actor names
    // and lock a colleague out of the console.
    it("never anonymises a staff account on inactivity", () => {
        const fn = FUNCTIONS_SQL.slice(
            FUNCTIONS_SQL.indexOf("create or replace function public.inactive_user_ids"),
        );
        expect(fn).toMatch(/u\.role = 'rider'/);
    });

    it("never re-erases an account that is already erased", () => {
        const fn = FUNCTIONS_SQL.slice(
            FUNCTIONS_SQL.indexOf("create or replace function public.inactive_user_ids"),
        );
        expect(fn).toMatch(/u\.erased_at is null/);
    });
});

describe("the job is scheduled", () => {
    it("runs daily, after the payment sweeps", () => {
        expect(CRON_SQL).toContain("'retention-purge-daily'");
        expect(CRON_SQL).toContain("'30 3 * * *'");
    });

    // Retention destroys data. Running it before a sweep that still needs to
    // read that data would make the sweep's behaviour depend on the clock.
    it("runs last among the daily jobs", () => {
        const minuteOf = (job: string): number => {
            const at = CRON_SQL.indexOf(`'${job}'`);
            const schedule = CRON_SQL.slice(at, at + 200).match(/'(\d+) 3 \* \* \*'/);
            return schedule ? Number(schedule[1]) : -1;
        };
        const retention = minuteOf("retention-purge-daily");
        for (const job of [
            "pickup-reminder-daily",
            "payment-due-reminder-daily",
            "payment-overdue-sweep-daily",
            "refund-eligibility-sweep-daily",
            "maintenance-plan-resume-safety-net-daily",
        ]) {
            expect(minuteOf(job), `${job} is not scheduled before retention`)
                .toBeLessThan(retention);
        }
    });

    // A rider must be warned that a payment is due BEFORE the sweep marks
    // them past due, or the first they hear of it is the overdue notice.
    it("warns about a due payment before sweeping it overdue", () => {
        expect(CRON_SQL.indexOf("'payment-due-reminder-daily'"))
            .toBeLessThan(CRON_SQL.indexOf("'payment-overdue-sweep-daily'"));
    });

    it("reads the service key from Vault rather than embedding it", () => {
        expect(CRON_SQL).toContain("vault.decrypted_secrets");
        expect(CRON_SQL).toMatch(/name = 'service_role_key'/);
        // A key literal would look like one of these.
        expect(CRON_SQL).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
    });

    it("schedules every scheduled function exactly once", () => {
        const JOBS = [
            "pickup-reminder", "payment-due-reminder", "payment-overdue-sweep",
            "refund-eligibility-sweep", "maintenance-plan-resume-safety-net",
            "data-retention-purge", "plan-expiry-reminder",
            "booking-payment-expiry-sweep", "failed-payment-retry", "failed-refund-retry",
        ];
        for (const job of JOBS) {
            const calls = CRON_SQL.match(
                new RegExp(`invoke_edge_function\\('${job}'\\)`, "g"),
            );
            expect(calls?.length, `${job} is not scheduled exactly once`).toBe(1);
        }
    });
});

describe("the export policy is gone with the export", () => {
    // The purge job drives itself entirely from retention_policies and has no
    // data_exports handler any more. A policy row for a category nothing can
    // service would make the job fail on it every run.
    it("has no data_exports policy in the constants", () => {
        expect(RETENTION_POLICIES.map((p) => p.category)).not.toContain("data_exports");
    });

    // DISABLED, not deleted. retention_runs.retention_policy_category
    // references the row, and those rows are the audit trail of every purge
    // ever run — destroying compliance evidence to tidy a config row is the
    // wrong trade. The job selects `where is_enabled = true`, so a disabled
    // policy never reaches the handler lookup.
    it("disables the policy instead of deleting it", () => {
        expect(DROP_EXPORTS_SQL).toMatch(/update public\.retention_policies/);
        expect(DROP_EXPORTS_SQL).toMatch(/is_enabled\s*=\s*false/);
        expect(DROP_EXPORTS_SQL).toMatch(/where category = 'data_exports'/);
    });

    it("does not delete the policy row, which retention_runs references", () => {
        expect(DROP_EXPORTS_SQL).not.toMatch(/delete from public\.retention_policies/);
    });

    // Postgres refuses a direct DELETE on storage.objects
    // (storage.protect_delete), so the object teardown cannot live in SQL. The
    // migration has to say where it went instead of silently omitting it.
    it("does not attempt a direct delete on the storage tables", () => {
        expect(DROP_EXPORTS_SQL).not.toMatch(/delete from storage\./);
        expect(DROP_EXPORTS_SQL).toMatch(/Storage API/);
    });

    it("drops the pointer column, which nothing can write now", () => {
        expect(DROP_EXPORTS_SQL).toMatch(/drop column if exists export_storage_path/);
    });

    it("leaves the purge job with no export handler or bucket", () => {
        expect(PURGE_FN).not.toContain("data_exports");
        expect(PURGE_FN).not.toContain("EXPORT_BUCKET");
        expect(PURGE_FN).not.toContain("export_storage_path");
    });
});

