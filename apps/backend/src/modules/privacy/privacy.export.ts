import { supabaseAdmin } from "../../config/supabase";
import { EXPORT_URL_TTL_SECONDS } from "./retention.constants";

export const EXPORT_BUCKET = "data-exports";

/**
 * Builds the rider's personal-data bundle (DPDPA s.11).
 *
 * Three rules govern what goes in, and they are the whole design:
 *
 *  1. Everything WE hold ABOUT THEM. Not a summary — the actual rows, so the
 *     rider can check them and exercise the correction right meaningfully.
 *
 *  2. Nothing about anyone ELSE. A referral names the other rider; a support
 *     ticket names the staff member who handled it. Access is the rider's
 *     right to THEIR data, and satisfying it must not disclose someone
 *     else's. Counterparties are reduced to a first name or dropped.
 *
 *  3. No internal machinery. Storage paths, service keys and staff notes are
 *     excluded — a signed path in a file the rider can forward is a leak, and
 *     internal notes are our record of a decision, not their personal data.
 *
 * The whole thing is assembled in memory. A rider's footprint is hundreds of
 * rows, not millions; if that ever stops being true, the
 * data_principal_requests row already models the asynchronous case.
 */
export async function buildExportBundle(userId: string): Promise<Record<string, unknown>> {
    // deposits hang off a SUBSCRIPTION and rental_feedback off a RENTAL —
    // neither has a user_id column at all. Those parent ids have to be
    // resolved first, or the sections come back empty and the rider silently
    // does not receive their financial records.
    const [subscriptionIds, rentalIds] = await Promise.all([
        ownIds("subscriptions", userId),
        ownIds("rentals", userId),
    ]);

    const [
        profile, addresses, relatedPersons, riderProfile, documents,
        consents, consentHistory, requests,
        bookings, rentals, invoices, deposits, refunds,
        support, feedback, notifications, piiAccess,
    ] = await Promise.all([
        // The flat rider row this used to read is now five tables: the address,
        // the nominee and emergency contact, and the KYC state each moved out
        // of `users`. They are read separately and presented under their own
        // keys rather than flattened back, because the bundle is a record of
        // what we hold, not a mirror of the profile screen.
        one("users",
            "id, full_name, email, phone, date_of_birth, gender, role, status, created_at, updated_at",
            userId),
        many("user_addresses",
            "address_type, line_1, line_2, city, state, postal_code, country, is_primary, created_at",
            userId),
        many("user_related_persons",
            "person_role, full_name, relationship, phone, email, created_at, updated_at", userId),
        oneBy("rider_profiles", "kyc_status, onboarding_completed_at, created_at", "user_id", userId),
        // document_number_last4, never a full number — the rest is encrypted
        // and is not handed back in plaintext here.
        many("kyc_documents",
            "id, document_type, document_number_last4, verification_status, rejection_reason, issued_on, expires_on, submitted_at, verified_at, created_at",
            userId),
        many("v_current_consents",
            "purpose, action, notice_version_snapshot, language, decided_at", userId),
        many("consent_records",
            "purpose, action, notice_version_snapshot, language, source, ip_address, created_at",
            userId),
        many("data_principal_requests",
            "reference, type:request_type, status, details, sla_due_at, completed_at, created_at",
            userId),
        many("bookings",
            "id, status, requested_start_on, hold_expires_at, created_at, updated_at", userId),
        many("rentals",
            "id, status, picked_up_at, due_back_at, returned_at, end_reason, created_at", userId),
        many("invoices",
            "id, invoice_number, purpose, status, currency, subtotal_amount, total_amount, issued_on, due_on, created_at",
            userId),
        // Keyed by subscription, not user.
        byParent("deposits",
            "id, amount, status, held_at, refund_eligible_on, released_at, forfeited_at, created_at",
            "subscription_id", subscriptionIds),
        many("refunds",
            "id, amount, status, reason, initiated_at, completed_at, created_at", userId),
        many("support_tickets",
            "id, subject, category, status, priority, created_at, resolved_at", userId),
        byParent("rental_feedback", "rental_id, rating, comment, created_at", "rental_id", rentalIds),
        // The message, not the delivery attempt: which provider we tried and
        // whether it bounced is our operational record, not the rider's data.
        many("notification_messages",
            "id, notification_type_code, title, body, read_at, created_at", userId),
        // "Who looked at my data" — the accountability record, in the rider's
        // own hands. Actor names are deliberately omitted: the rider is
        // entitled to know that a member of staff looked and why, not to a
        // named individual, whose name is that employee's personal data.
        manyBy("pii_access_log", "resource, reason, created_at", "target_user_id", userId),
    ]);

    return {
        _about: {
            generated_at: new Date().toISOString(),
            controller: "Swapngo Fleet Hub",
            description:
                "Everything Swapngo holds about you. Information about other people " +
                "(for example the staff member who handled a ticket) is deliberately " +
                "left out — their details are not yours to receive.",
            note:
                "We do not hold your full Aadhaar or driving licence number. Only the " +
                "last four characters of each are stored; the rest was checked when " +
                "you entered it and then discarded.",
            not_included: [
                "Internal file locations for your document images",
                "Internal staff notes on your requests",
                "Other people's personal data",
                "Your payment card or UPI details, which are held only by our payment provider",
            ],
        },
        profile,
        addresses,
        nominee_and_emergency_contact: relatedPersons,
        rider_profile: riderProfile,
        identity_documents: documents,
        current_consents: consents,
        consent_history: consentHistory,
        privacy_requests: requests,
        bookings,
        rentals,
        invoices,
        deposits,
        refunds,
        support_tickets: support,
        rental_feedback: feedback,
        notifications,
        staff_access_to_your_data: piiAccess,
    };
}

/**
 * Writes the bundle to the private data-exports bucket and returns a
 * short-lived signed URL. Nothing about the object is public; the path is
 * stored on the request row so the retention job can purge it after 30 days.
 */
export async function storeExportBundle(
    userId: string,
    requestId: string,
    bundle: Record<string, unknown>,
): Promise<{ path: string; url: string; expires_in: number }> {
    const path = `${userId}/${requestId}.json`;
    const body = Buffer.from(JSON.stringify(bundle, null, 2), "utf8");

    const { error } = await supabaseAdmin.storage
        .from(EXPORT_BUCKET)
        .upload(path, body, { contentType: "application/json", upsert: true });
    if (error) throw error;

    const url = await createExportSignedUrl(path);
    return { path, url, expires_in: EXPORT_URL_TTL_SECONDS };
}

export async function createExportSignedUrl(path: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
        .from(EXPORT_BUCKET)
        .createSignedUrl(path, EXPORT_URL_TTL_SECONDS);
    if (error) throw error;
    return data.signedUrl;
}

export async function removeExportObjects(paths: string[]): Promise<void> {
    const real = paths.filter(Boolean);
    if (real.length === 0) return;
    const { error } = await supabaseAdmin.storage.from(EXPORT_BUCKET).remove(real);
    if (error) {
        // Count only — the paths embed the user id.
        console.error("[privacy.export] could not remove export objects", {
            paths: real.length,
            error: error.message,
        });
    }
}

// ---------------------------------------------------------------------------
// Query helpers
//
// Every one of these is scoped by user_id. There is no code path here that
// takes a table name and no filter.
//
// They take the table and columns as strings, which the generated `Database`
// types cannot follow — `from()` resolves its row type from a literal, so a
// `string` argument narrows to `never` and every `.eq()` after it fails to
// typecheck. `db` is that one escape hatch, deliberately kept to this file:
// the bundle is a generic walk over ~20 tables, and spelling each one out as
// its own typed query would trade a real safety property for a fake one, since
// the column lists are strings either way.
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabaseAdmin as any;

async function one(table: string, columns: string, userId: string) {
    const { data, error } = await db
        .from(table).select(columns).eq("id", userId).maybeSingle();
    if (error) throw error;
    return data ?? null;
}

async function many(table: string, columns: string, userId: string) {
    return manyBy(table, columns, "user_id", userId);
}

async function oneBy(table: string, columns: string, column: string, userId: string) {
    const { data, error } = await db
        .from(table).select(columns).eq(column, userId).maybeSingle();
    if (error) throw error;
    return data ?? null;
}

/**
 * The ids of the rider's own rows in a parent table.
 *
 * Some child tables have no user_id — deposits hang off a subscription,
 * rental_feedback off a rental. A `.eq("user_id", ...)` against them does not
 * return an empty set, it ERRORS, which the degradation below turns into a
 * silent "unavailable" section. That is how four sections of this bundle were
 * quietly missing.
 */
async function ownIds(table: string, userId: string): Promise<string[]> {
    const { data, error } = await db
        .from(table).select("id").eq("user_id", userId).limit(5000);
    if (error) {
        console.error("[privacy.export] could not resolve parent ids", {
            table, error: error.message,
        });
        return [];
    }
    return (data ?? []).map((r: { id: string }) => r.id);
}

async function byParent(table: string, columns: string, column: string, parentIds: string[]) {
    if (parentIds.length === 0) return [];
    const { data, error } = await db
        .from(table).select(columns).in(column, parentIds).limit(5000);
    if (error) {
        console.error("[privacy.export] section unavailable", { table, error: error.message });
        return { unavailable: true, reason: "This section could not be read." };
    }
    return data ?? [];
}

async function manyBy(table: string, columns: string, column: string, userId: string) {
    const { data, error } = await db
        .from(table).select(columns).eq(column, userId).limit(5000);
    if (error) {
        // Degrading rather than throwing: the rider is better served by a
        // bundle with one section flagged than by a 500 and nothing.
        //
        // Logged at ERROR, not warn, and deliberately loudly. This fallback
        // was originally meant for transient failures, but it also silently
        // absorbed four sections whose column names were simply WRONG — the
        // rider got "unavailable" for their invoices and refunds and nobody
        // noticed. A permanent bug and a blip look identical here, so this
        // has to be noisy enough that the first one gets investigated.
        console.error("[privacy.export] SECTION MISSING FROM A RIGHTS EXPORT", {
            table,
            column,
            error: error.message,
        });
        return { unavailable: true, reason: "This section could not be read." };
    }
    return data ?? [];
}
