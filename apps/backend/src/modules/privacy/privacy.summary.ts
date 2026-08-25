import { supabaseAdmin } from "../../config/supabase";
import { RETENTION_POLICIES } from "./retention.constants";

/**
 * The rider's s.11 summary.
 *
 * DPDPA s.11(1) is narrower than it is often implemented. It gives the Data
 * Principal the right to obtain:
 *
 *   (a) "a summary of personal data which is being processed ... and the
 *       processing activities undertaken";
 *   (b) "the identities of all other Data Fiduciaries and Data Processors
 *       with whom the personal data has been shared ... along with a
 *       description of the personal data so shared";
 *   (c) any other information as may be prescribed.
 *
 * A SUMMARY — not a copy. India has no right to data portability: it was in
 * the 2019 Bill and was dropped from the 2023 Act, and Rule 14 of the DPDP
 * Rules 2025 prescribes no format at all. This module therefore returns
 * counts and categories rather than rows, which satisfies (a) exactly and
 * happens to be the safer artefact: there is no file, no bucket, no signed
 * URL and no 30-day object to purge.
 *
 * (b) is the part a bundle of the rider's own rows can never satisfy, because
 * the answer is not in their rows. It is RECIPIENTS below, kept in step with
 * docs/dpdpa/processor-dpa-checklist.md.
 *
 * The rider can already read their own rentals, invoices and tickets in the
 * app. What they cannot otherwise see is the shape of the whole: which
 * categories exist, how much of each we hold, how long we keep it, and who
 * else receives it. That is what this answers.
 */

export interface SummaryCategory {
    key: string;
    label: string;
    /** What the category actually contains, in the rider's words. */
    what: string;
    count: number;
    /** How long it is kept, and why it stops being ours to hold. */
    retention: string;
}

export interface SummaryRecipient {
    name: string;
    receives: string;
    why: string;
}

export interface PrivacySummaryIdentity {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    date_of_birth: string | null;
    gender: string | null;
    address: string | null;
    kyc_status: string | null;
    /** Document type plus the last four characters — never a full number. */
    identity_documents: { document_type: string; last4: string | null; status: string }[];
}

export interface PrivacySummary {
    generated_at: string;
    controller: string;
    identity: PrivacySummaryIdentity;
    categories: SummaryCategory[];
    consents: { purpose: string; granted: boolean; decided_at: string | null }[];
    shared_with: SummaryRecipient[];
    not_held: string[];
}

const CONTROLLER = "Swapngo Fleet Hub";

/**
 * DPDPA s.11(1)(b): who else receives the rider's data, and what they get.
 *
 * Mirrors docs/dpdpa/processor-dpa-checklist.md. This list is the statutory
 * half of the right and the half no export of the rider's own rows can
 * supply — it is not derivable from any table, so it is maintained here and
 * asserted against the checklist by privacy.summary.test.ts.
 */
export const RECIPIENTS: readonly SummaryRecipient[] = [
    {
        name: "Supabase",
        receives: "Everything — our database, sign-in identities and stored document images",
        why: "They host the service. Nothing runs without them.",
    },
    {
        name: "Razorpay",
        receives: "Your name, contact details and the payment instrument itself",
        why: "To take payments and issue refunds. We never see or store your card or UPI details.",
    },
    {
        name: "MSG91",
        receives: "Your phone number and the one-time code",
        why: "To send you the SMS you sign in with.",
    },
    {
        name: "Expo Push",
        receives: "Your device's push token and the title and body of the notification",
        why: "To deliver app notifications to your phone.",
    },
    {
        name: "Our map search provider",
        receives: "What you searched for, and a position rounded to about 1 km. No name, no account",
        why: "To find battery stations near an area you type in.",
    },
    {
        name: "Our map tile provider",
        receives: "Which part of the map your screen is showing",
        why: "To draw the map itself.",
    },
] as const;

/** What we deliberately do not hold, stated so the absence is verifiable. */
const NOT_HELD: readonly string[] = [
    "Your full Aadhaar or driving licence number — only the last four characters are kept. The rest was checked when you entered it and then discarded.",
    "Your card number or UPI ID — those stay with our payment provider and never reach us.",
    "Any record of where you are when you are not using the app.",
    "Other people's personal data, including the staff who handled your requests.",
] as const;

const retentionDays = (category: string): number | null =>
    RETENTION_POLICIES.find((p) => p.category === category)?.retainDays ?? null;

const YEARS = (days: number) => `${Math.round(days / 365)} years`;

/**
 * Category definitions: the table, what to call it, and how long it lives.
 *
 * Retention text is derived from RETENTION_POLICIES where a policy governs
 * the category, so a period changed in the schedule cannot silently disagree
 * with what the rider is told here.
 */
interface CategorySpec {
    key: string;
    label: string;
    what: string;
    table: string;
    /** Column holding the rider's id. Defaults to user_id. */
    column?: string;
    retention: string;
}

const FINANCIAL_RETENTION = `Kept for ${YEARS(
    retentionDays("financial_records") ?? 2920,
)} — tax and accounting law requires it, so this survives account deletion.`;

const CATEGORY_SPECS: readonly CategorySpec[] = [
    {
        key: "addresses",
        label: "Addresses",
        what: "The addresses you have given us",
        table: "user_addresses",
        retention: "Kept while your account is open.",
    },
    {
        key: "related_persons",
        label: "Nominee and emergency contact",
        what: "The people you named, and how to reach them",
        table: "user_related_persons",
        retention: "Kept while your account is open.",
    },
    {
        key: "identity_documents",
        label: "Identity documents",
        what: "Your ID document images and their verification status",
        table: "kyc_documents",
        retention: "Kept while your account is open, then deleted with it.",
    },
    {
        key: "consent_records",
        label: "Consent history",
        what: "Every choice you made about how we use your data, and when",
        table: "consent_records",
        retention: `Kept for ${YEARS(
            retentionDays("consent_records") ?? 2920,
        )}. This is our proof of what you agreed to, so it is not deleted on request.`,
    },
    {
        key: "privacy_requests",
        label: "Privacy requests",
        what: "Requests like this one, and what we decided",
        table: "data_principal_requests",
        retention: "Kept while your account is open.",
    },
    {
        key: "bookings",
        label: "Bookings",
        what: "Scooters you reserved",
        table: "bookings",
        retention: "Kept while your account is open.",
    },
    {
        key: "rentals",
        label: "Rides",
        what: "When you picked up and returned, and why a ride ended",
        table: "rentals",
        retention: "Kept while your account is open.",
    },
    {
        key: "invoices",
        label: "Invoices",
        what: "What you were charged, and for what",
        table: "invoices",
        retention: FINANCIAL_RETENTION,
    },
    {
        key: "refunds",
        label: "Refunds",
        what: "Money returned to you, and why",
        table: "refunds",
        retention: FINANCIAL_RETENTION,
    },
    {
        key: "support_tickets",
        label: "Support requests",
        what: "What you asked us, in your words",
        table: "support_tickets",
        retention: "Kept while your account is open.",
    },
    {
        key: "notifications",
        label: "Notifications",
        what: "Messages we sent you, and whether you opened them",
        table: "notification_messages",
        retention: (() => {
            const d = retentionDays("notification_bodies");
            return d
                ? `The wording is removed after ${d} days; only the fact that we sent something remains.`
                : "Removed on the notification retention schedule.";
        })(),
    },
    {
        key: "staff_access",
        label: "Staff who opened your data",
        what: "Every time a member of staff opened your record, and the reason they gave",
        table: "pii_access_log",
        column: "target_user_id",
        retention: `Kept for ${YEARS(retentionDays("pii_access_log") ?? 730)}.`,
    },
] as const;

// ---------------------------------------------------------------------------

export async function buildPrivacySummary(userId: string): Promise<PrivacySummary> {
    // deposits hang off a SUBSCRIPTION and rental_feedback off a RENTAL —
    // neither has a user_id column, so a count filtered on one does not come
    // back empty, it ERRORS. The parent ids have to be resolved first.
    const [subscriptionIds, rentalIds] = await Promise.all([
        ownIds("subscriptions", userId),
        ownIds("rentals", userId),
    ]);

    const [
        identity, counts, depositCount, feedbackCount, consents,
    ] = await Promise.all([
        buildIdentity(userId),
        Promise.all(
            CATEGORY_SPECS.map(async (spec) => ({
                spec,
                count: await countRows(spec.table, spec.column ?? "user_id", userId),
            })),
        ),
        countByParent("deposits", "subscription_id", subscriptionIds),
        countByParent("rental_feedback", "rental_id", rentalIds),
        currentConsents(userId),
    ]);

    const categories: SummaryCategory[] = counts.map(({ spec, count }) => ({
        key: spec.key,
        label: spec.label,
        what: spec.what,
        count,
        retention: spec.retention,
    }));

    // Inserted next to the other financial categories rather than appended,
    // so the list reads in the same order the rider met these things.
    const invoicesAt = categories.findIndex((c) => c.key === "invoices");
    categories.splice(invoicesAt + 1, 0, {
        key: "deposits",
        label: "Deposits",
        what: "Refundable deposits held against your subscription",
        count: depositCount,
        retention: FINANCIAL_RETENTION,
    });

    categories.push({
        key: "rental_feedback",
        label: "Ride feedback",
        what: "Ratings and comments you left after a ride",
        count: feedbackCount,
        retention: "Kept while your account is open.",
    });

    return {
        generated_at: new Date().toISOString(),
        controller: CONTROLLER,
        identity,
        categories,
        consents,
        shared_with: [...RECIPIENTS],
        not_held: [...NOT_HELD],
    };
}

async function buildIdentity(userId: string): Promise<PrivacySummaryIdentity> {
    const [user, address, profile, documents] = await Promise.all([
        db.from("users")
            .select("full_name, email, phone, date_of_birth, gender")
            .eq("id", userId)
            .maybeSingle(),
        db.from("user_addresses")
            .select("line_1, line_2, city, state, postal_code, country, is_primary")
            .eq("user_id", userId)
            .order("is_primary", { ascending: false })
            .limit(1)
            .maybeSingle(),
        db.from("rider_profiles").select("kyc_status").eq("user_id", userId).maybeSingle(),
        // last4 only. The full number is encrypted and is not decrypted here
        // or anywhere else on a read path.
        db.from("kyc_documents")
            .select("document_type, document_number_last4, verification_status")
            .eq("user_id", userId)
            .limit(50),
    ]);

    const u = (user.data ?? {}) as Record<string, string | null>;
    const a = address.data as Record<string, string | null> | null;

    return {
        full_name: u.full_name ?? null,
        email: u.email ?? null,
        phone: u.phone ?? null,
        date_of_birth: u.date_of_birth ?? null,
        gender: u.gender ?? null,
        address: a
            ? [a.line_1, a.line_2, a.city, a.state, a.postal_code, a.country]
                .filter(Boolean)
                .join(", ")
            : null,
        kyc_status: (profile.data as { kyc_status?: string } | null)?.kyc_status ?? null,
        identity_documents: ((documents.data ?? []) as Record<string, string | null>[]).map(
            (d) => ({
                document_type: d.document_type ?? "",
                last4: d.document_number_last4 ?? null,
                status: d.verification_status ?? "",
            }),
        ),
    };
}

async function currentConsents(
    userId: string,
): Promise<{ purpose: string; granted: boolean; decided_at: string | null }[]> {
    const { data, error } = await db
        .from("v_current_consents")
        .select("purpose, action, decided_at")
        .eq("user_id", userId);
    if (error) {
        console.error("[privacy.summary] could not read consents", { error: error.message });
        return [];
    }
    return ((data ?? []) as { purpose: string; action: string; decided_at: string | null }[]).map(
        (r) => ({
            purpose: r.purpose,
            granted: r.action === "grant",
            decided_at: r.decided_at,
        }),
    );
}

// ---------------------------------------------------------------------------
// Counting helpers
//
// Every one is scoped to the rider. `head: true` means the rows are counted
// in the database and never travel — a summary that shipped the rows to count
// them would be the export we deliberately removed.
//
// They take the table as a string, which the generated `Database` types cannot
// follow: `from()` resolves its row type from a literal, so a `string`
// argument narrows to `never` and every `.eq()` after it fails to typecheck.
// `db` is that one escape hatch, kept to this file.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabaseAdmin as any;

async function countRows(table: string, column: string, userId: string): Promise<number> {
    const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq(column, userId);
    if (error) {
        // Loud, and deliberately so. This exact degradation once hid four
        // sections of the old export whose column names were simply wrong,
        // and a rider was shown "unavailable" for their own invoices. A
        // permanent bug and a transient blip look identical here.
        console.error("[privacy.summary] CATEGORY MISSING FROM A RIGHTS SUMMARY", {
            table, column, error: error.message,
        });
        return 0;
    }
    return count ?? 0;
}

async function ownIds(table: string, userId: string): Promise<string[]> {
    const { data, error } = await db
        .from(table).select("id").eq("user_id", userId).limit(5000);
    if (error) {
        console.error("[privacy.summary] could not resolve parent ids", {
            table, error: error.message,
        });
        return [];
    }
    return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

async function countByParent(
    table: string,
    column: string,
    parentIds: string[],
): Promise<number> {
    if (parentIds.length === 0) return 0;
    const { count, error } = await db
        .from(table)
        .select("id", { count: "exact", head: true })
        .in(column, parentIds);
    if (error) {
        console.error("[privacy.summary] CATEGORY MISSING FROM A RIGHTS SUMMARY", {
            table, column, error: error.message,
        });
        return 0;
    }
    return count ?? 0;
}
