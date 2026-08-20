import type { DpRequestType } from "./privacy.types";

/**
 * Response periods, in days, per request type.
 *
 * These are engineering defaults awaiting legal confirmation, and whatever
 * they end up as must match three other places: the privacy notice
 * (consent_notices.body_*), the rider-facing copy in apps/mobile/src/i18n,
 * and docs/dpdpa/rights-request-sop.md. Publishing a period is a commitment;
 * a period the ops team cannot actually meet is worse than a longer one.
 *
 * Erasure gets the shortest clock deliberately — it is the request a rider is
 * most likely to be anxious about, and the least defensible to sit on.
 */
export const SLA_DAYS: Record<DpRequestType, number> = {
    access_export: 30,
    correction: 30,
    erasure: 30,
    grievance: 30,
    nominee_update: 7,
};

/**
 * Cooling-off window before an approved erasure is actually executed.
 *
 * Erasure is irreversible and the trigger is a single tap. Seven days gives a
 * rider who tapped by mistake, or whose phone was taken, a way back — and
 * gives ops a window to spot a coerced or fraudulent request. It runs from
 * APPROVAL, not from submission, so a slow review does not eat the rider's
 * protection.
 */
export const ERASURE_GRACE_DAYS = 7;

/** One self-serve export per rider per day. Each bundle is concentrated PII. */
export const EXPORT_RATE_LIMIT_HOURS = 24;

/** Lifetime of a signed URL for a generated export bundle. */
export const EXPORT_URL_TTL_SECONDS = 300;

/**
 * Mirrors the seeded rows in
 * supabase/v2/migrations/20260819102400_realtime_and_seed.sql, plus the
 * `data_exports` row added by migration 31.
 *
 * Duplicated on purpose: the database is the source of truth at run time (ops
 * can change a period without a deploy), and retention.test.ts asserts these
 * two agree, so a change in one that is not made in the other fails the build
 * rather than drifting silently.
 *
 * The categories were re-cut with the schema, not merely renamed:
 *
 *   `notification_payloads` + `notification_rows` became
 *   `notification_bodies` + `notification_events`, because the message and
 *   the event are separate tables now and outlive each other by different
 *   periods.
 *
 *   `otp_attempts` is `auth_otp_attempts` and has NO TABLE — OTP rate
 *   limiting is Supabase Auth's, not ours. The row survives so the schedule
 *   stays complete, and the job's handler says so out loud rather than
 *   reporting a clean purge of nothing.
 *
 *   `kyc_former_customer` is gone. Its period was an explicit placeholder
 *   nobody had signed off, and a policy row for a period that does not exist
 *   invites someone to implement it.
 *
 * `never` is `retain` — the same meaning, in the vocabulary the seed uses.
 */
export interface RetentionPolicySeed {
    category: string;
    retainDays: number;
    action: "delete" | "anonymise" | "redact" | "retain";
}

export const RETENTION_POLICIES: readonly RetentionPolicySeed[] = [
    // NO TABLE BACKS THIS ONE — see the header. It is the only place in the
    // repository outside a comment where an old-schema table name still
    // appears, so it reads like a missed rename to anyone grepping for one.
    // It is not: OTP rate limiting is Supabase Auth's, the row exists so the
    // published schedule is complete, and data-retention-purge/index.ts
    // reports it as "no table" rather than as a clean purge of nothing.
    { category: "auth_otp_attempts", retainDays: 30, action: "delete" },
    { category: "notification_bodies", retainDays: 180, action: "redact" },
    { category: "notification_events", retainDays: 365, action: "delete" },
    { category: "audit_logs_general", retainDays: 730, action: "delete" },
    { category: "pii_access_log", retainDays: 730, action: "delete" },
    { category: "inactive_riders", retainDays: 1095, action: "anonymise" },
    { category: "kyc_abandoned", retainDays: 90, action: "delete" },
    { category: "data_exports", retainDays: 30, action: "delete" },
    // Retained, never purged by the job. Present so the schedule is complete
    // and so nobody adds a purge for one by accident.
    { category: "audit_logs_financial", retainDays: 2920, action: "retain" },
    { category: "consent_records", retainDays: 2920, action: "retain" },
    { category: "financial_records", retainDays: 2920, action: "retain" },
] as const;

/** Categories the purge job must never delete from, whatever the config says. */
export const NEVER_PURGED = RETENTION_POLICIES
    .filter((p) => p.action === "retain")
    .map((p) => p.category);

export function slaDueAt(type: DpRequestType, from: Date = new Date()): string {
    const due = new Date(from);
    due.setUTCDate(due.getUTCDate() + SLA_DAYS[type]);
    return due.toISOString();
}

export function graceEndsAt(from: Date = new Date()): string {
    const end = new Date(from);
    end.setUTCDate(end.getUTCDate() + ERASURE_GRACE_DAYS);
    return end.toISOString();
}
