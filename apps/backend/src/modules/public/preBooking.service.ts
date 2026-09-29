import { supabaseAdmin } from "../../config/supabase";
import { env } from "../../config/env";
import { getResend, isEmailConfigured } from "../../config/resend";
import { serviceUnavailable } from "../../common/AppError";
import { paginate, toRange } from "../../common/pagination";
import { Paginated } from "../../types";
import { renderNotificationEmail } from "../notifications/email-template";
import { PreBookingBody, RENTAL_PLAN_PREFERENCE_LABELS, RENTAL_PLAN_PREFERENCES } from "./public.validation";

/**
 * The public website's "pre-book" request — collects interest while the
 * fleet isn't ready for normal bookings yet. Same email-only, not-persisted
 * shape as submitContactQuery in contact.service.ts, and for the same
 * reason: there is no rider account to own a row, so this is a message to
 * a human inbox, not a queue.
 */

/** Rendered as `+91 98765 43210` from the 10 digits the schema stores. */
function formatPhone(tenDigits: string): string {
    return `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
}

/** e.g. "5 September 2026, 11:45 PM" in IST — the team's own timezone. */
function formatSubmittedAt(now: Date): string {
    return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Asia/Kolkata",
        hour12: true,
    }).format(now);
}

export interface PreBookingResult {
    /** Resend's message id, for tracing a delivery in their dashboard. */
    provider_ref: string | null;
}

/**
 * Has this number already pre-booked? Checked by public.routes.ts BEFORE
 * submitPreBooking runs, same layer as the per-phone rate limiter it sits
 * beside — a deliberate, disclosed business rule (like the contact form's
 * "already received several messages from this address"), not a masked
 * provider failure, so it belongs outside submitPreBooking's own
 * mask-everything try/catch.
 */
export async function preBookingExistsForPhone(phone: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from("pre_bookings")
        .select("id")
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();
    if (error) {
        // Fail OPEN: a duplicate check that can't run (a transient DB blip)
        // must never block a legitimate new submission — same reasoning as
        // the best-effort insert below. Worst case on a false negative here
        // is one extra row in the grid, not a lost lead.
        console.error("[preBooking] duplicate check failed", { error: error.message });
        return false;
    }
    return !!data;
}

/**
 * Emails one pre-booking request to the team inbox.
 *
 * Throws `serviceUnavailable` when email is not configured, and lets a
 * provider failure propagate — the caller (public.routes.ts) turns both into
 * the same generic "try again shortly" response, exactly as the contact form
 * does, so a visitor can act on neither and a prober learns nothing about
 * which dependency is down.
 */
export async function submitPreBooking(input: PreBookingBody): Promise<PreBookingResult> {
    if (!isEmailConfigured()) {
        throw serviceUnavailable("Email provider is not configured.");
    }

    // Best-effort: the admin console's grid is a convenience on top of the
    // email, not the primary channel, so a persistence hiccup must never
    // stop the notification that actually reaches a human going out.
    const { error: insertError } = await supabaseAdmin.from("pre_bookings").insert({
        full_name: input.full_name,
        phone: input.phone,
        email: input.email ?? null,
        location: input.location,
        plan_preference: input.plan_preference,
        message: input.message ?? null,
    });
    if (insertError) {
        console.error("[preBooking] failed to persist submission", { error: insertError.message });
    }

    const planLabel = RENTAL_PLAN_PREFERENCE_LABELS[input.plan_preference];
    const submittedAt = formatSubmittedAt(new Date());
    const phoneDisplay = formatPhone(input.phone);

    // Every value here is escaped by renderNotificationEmail before it reaches
    // the markup, and stripped of control characters by the schema before it
    // reaches the subject/headers.
    const html = renderNotificationEmail({
        heading: "New Swapngo Pre-Booking Request",
        fields: [
            { label: "Name", value: input.full_name },
            { label: "Mobile", value: phoneDisplay },
            { label: "Email", value: input.email ?? "Not provided" },
            { label: "Location", value: input.location },
            { label: "Preferred Plan", value: planLabel },
            { label: "Submitted", value: submittedAt },
        ],
        messageBlock: input.message
            ? { label: "Additional Requirements", text: input.message }
            : undefined,
        // A tel CTA rather than mailto: phone is the one contact detail every
        // submission has (email is optional here), so it's the reliable way
        // to reach whoever filled this in.
        ctaLabel: `Call ${input.full_name}`,
        ctaUrl: `tel:${phoneDisplay.replace(/\s+/g, "")}`,
    });

    const sent = await getResend().emails.send({
        from: env.emailFrom,
        to: env.contactInboxEmail,
        subject: "New Swapngo Pre-Booking Request",
        // Only set when the visitor gave one — Resend rejects an empty string.
        ...(input.email ? { replyTo: input.email } : {}),
        html,
        text: buildPlainText(input, planLabel, phoneDisplay, submittedAt),
    });

    if (sent.error) {
        // Resend reports failures in the body rather than throwing.
        throw new Error(sent.error.message);
    }
    return { provider_ref: sent.data?.id ?? null };
}

/** Plain-text alternative, for clients that don't render the HTML part. Matches the requested format. */
function buildPlainText(
    input: PreBookingBody,
    planLabel: string,
    phoneDisplay: string,
    submittedAt: string,
): string {
    return [
        "New Swapngo Pre-Booking Request",
        "",
        "Customer Details",
        "----------------",
        `Name: ${input.full_name}`,
        `Mobile: ${phoneDisplay}`,
        `Email: ${input.email ?? "Not provided"}`,
        `Location: ${input.location}`,
        `Preferred Plan: ${planLabel}`,
        "",
        "Additional Requirements:",
        input.message ?? "None provided",
        "",
        "Submitted At:",
        submittedAt,
    ].join("\n");
}

// ---------------------------------------------------------------------------
// Admin console read side — the grid at Rental Operations → Pre-Bookings.
// ---------------------------------------------------------------------------

export interface PreBookingRow {
    id: string;
    full_name: string;
    /** Bare 10 digits, same shape submitContactQuery's phone column stores. */
    phone: string;
    email: string | null;
    location: string;
    plan_preference: (typeof RENTAL_PLAN_PREFERENCES)[number];
    message: string | null;
    created_at: string;
}

export interface ListPreBookingsFilters {
    page: number;
    pageSize: number;
}

const PRE_BOOKING_COLUMNS = "id, full_name, phone, email, location, plan_preference, message, created_at";

export async function listPreBookings(filters: ListPreBookingsFilters): Promise<Paginated<PreBookingRow>> {
    const [from, to] = toRange(filters);
    const { data, error, count } = await supabaseAdmin
        .from("pre_bookings")
        .select(PRE_BOOKING_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(from, to);
    if (error) throw error;
    return paginate((data ?? []) as unknown as PreBookingRow[], count ?? 0, filters);
}
