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
 * supabase/migrations/20260814100500_dpdpa_retention.sql.
 *
 * Duplicated on purpose: the database is the source of truth at run time (ops
 * can change a period without a deploy), and retention.test.ts asserts these
 * two agree, so a change in one that is not made in the other fails the build
 * rather than drifting silently.
 */
export interface RetentionPolicySeed {
    category: string;
    retainDays: number;
    action: "delete" | "anonymise" | "redact" | "never";
}

export const RETENTION_POLICIES: readonly RetentionPolicySeed[] = [
    { category: "otp_attempts", retainDays: 90, action: "delete" },
    { category: "notification_payloads", retainDays: 90, action: "redact" },
    { category: "notification_rows", retainDays: 365, action: "delete" },
    { category: "pii_access_log", retainDays: 1095, action: "delete" },
    { category: "audit_logs_operational", retainDays: 730, action: "delete" },
    { category: "audit_logs_financial", retainDays: 2920, action: "delete" },
    { category: "consent_records", retainDays: 2920, action: "delete" },
    { category: "kyc_abandoned", retainDays: 90, action: "delete" },
    { category: "kyc_former_customer", retainDays: 2920, action: "delete" },
    { category: "inactive_accounts", retainDays: 1095, action: "anonymise" },
    { category: "data_exports", retainDays: 30, action: "delete" },
    // Never purged by the job. Present so the schedule is complete and so
    // nobody adds a purge for it by accident.
    { category: "financial_records", retainDays: 2920, action: "never" },
] as const;

/** Categories the purge job must never delete from, whatever the config says. */
export const NEVER_PURGED = RETENTION_POLICIES
    .filter((p) => p.action === "never")
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
