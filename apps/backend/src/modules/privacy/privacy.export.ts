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
    // deposits, refunds and damages are keyed by BOOKING, not by user — they
    // have no user_id column at all. Their booking ids have to be resolved
    // first, or those sections come back empty and the rider silently does not
    // receive their financial records.
    const bookingIds = await ownBookingIds(userId);

    const [
        profile, documents, consents, consentHistory, requests,
        bookings, rentals, invoices, deposits, refunds,
        support, feedback, notifications, referralsUsed, referralsMade, piiAccess,
    ] = await Promise.all([
        one("users",
            "id, full_name, email, phone, date_of_birth, gender, address_line_1, address_line_2, city, state, postal_code, country, emergency_contact_name, emergency_contact_phone, nominee_full_name, nominee_relationship, nominee_phone, nominee_email, account_status, kyc_status, referral_code, created_at, updated_at",
            userId),
        // doc_number_last4, never a full number — there is no full number.
        many("user_documents",
            "id, doc_type, doc_number_last4, verification_status, rejection_reason, expiry_date, submitted_at, verified_at, created_at",
            userId),
        many("v_current_consents", "purpose, action, notice_version, decided_at", userId),
        many("consent_records",
            "purpose, action, notice_version, language, source, ip, created_at", userId),
        many("data_principal_requests",
            "reference, type, status, details, sla_due_at, completed_at, created_at", userId),
        many("bookings",
            "id, status, start_day, created_at, cancelled_at, cancellation_reason", userId),
        many("rentals",
            "id, status, started_at, ended_at, return_reason, return_feedback", userId),
        many("invoices",
            "id, amount_due, status, payment_status, payment_method, payment_type, due_date, paid_at, created_at",
            userId),
        // Keyed by booking, not user.
        byBooking("deposits", "id, amount, status, held_at, refund_eligible_at, refunded_at, forfeited_at, created_at", bookingIds),
        byBooking("refunds", "id, amount, status, initiated_at, processed_at, created_at", bookingIds),
        many("support_requests",
            "id, subject, description, status, priority, created_at, resolved_at", userId),
        many("rental_feedback", "id, rating, comment, created_at", userId),
        many("notifications_log", "id, channel, template, status, sent_at, created_at", userId),
        // referrals has referrer_id and referee_id, no user_id. Both sides are
        // the rider's own data, so both are included — but the columns
        // deliberately omit the counterparty's id, because the OTHER rider in
        // a referral is not this rider's data to receive.
        manyBy("referrals", "code_used, status, qualified_at, created_at", "referee_id", userId),
        manyBy("referrals", "code_used, status, qualified_at, created_at", "referrer_id", userId),
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
                "(for example the rider who referred you, or the staff member who " +
                "handled a ticket) is deliberately left out — their details are not " +
                "yours to receive.",
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
        referrals_you_were_referred_by: referralsUsed,
        referrals_you_made: referralsMade,
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
// ---------------------------------------------------------------------------

async function one(table: string, columns: string, userId: string) {
    const { data, error } = await supabaseAdmin
        .from(table).select(columns).eq("id", userId).maybeSingle();
    if (error) throw error;
    return data ?? null;
}

async function many(table: string, columns: string, userId: string) {
    return manyBy(table, columns, "user_id", userId);
}

/**
 * The rider's booking ids.
 *
 * deposits, refunds and damages have no user_id — they hang off a booking. A
 * `.eq("user_id", ...)` against them does not return an empty set, it ERRORS,
 * which the degradation below turns into a silent "unavailable" section. That
 * is how four sections of this bundle were quietly missing.
 */
async function ownBookingIds(userId: string): Promise<string[]> {
    const { data, error } = await supabaseAdmin
        .from("bookings").select("id").eq("user_id", userId).limit(5000);
    if (error) {
        console.error("[privacy.export] could not resolve bookings", { error: error.message });
        return [];
    }
    return (data ?? []).map((r) => (r as { id: string }).id);
}

async function byBooking(table: string, columns: string, bookingIds: string[]) {
    if (bookingIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
        .from(table).select(columns).in("booking_id", bookingIds).limit(5000);
    if (error) {
        console.error("[privacy.export] section unavailable", { table, error: error.message });
        return { unavailable: true, reason: "This section could not be read." };
    }
    return data ?? [];
}

async function manyBy(table: string, columns: string, column: string, userId: string) {
    const { data, error } = await supabaseAdmin
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
