import { env } from "../../config/env";
import { getResend, isEmailConfigured } from "../../config/resend";
import { serviceUnavailable } from "../../common/AppError";
import { renderNotificationEmail } from "../notifications/email-template";
import {
    CONTACT_METHOD_LABELS,
    ContactQueryBody,
    QUERY_TYPE_LABELS,
} from "./public.validation";

/**
 * The public website's "contact us" query.
 *
 * NOT persisted, by design. `support_tickets` is keyed on `user_id` — a
 * registered rider raising a ticket about their own rental — and a website
 * visitor has no account, so reusing it would mean either a nullable owner on
 * a table whose every query filters by owner, or a fake user row per enquiry.
 * Neither is worth it for a form whose entire job is to reach a human inbox,
 * so this is email-only and no migration was added. If enquiries later need a
 * queue, status and assignment, that is a real table of its own, not a
 * loosened support_tickets.
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

export interface ContactQueryResult {
    /** Resend's message id, for tracing a delivery in their dashboard. */
    provider_ref: string | null;
}

/**
 * Emails one submitted query to the team inbox.
 *
 * Throws `serviceUnavailable` when email is not configured, and lets a
 * provider failure propagate — the caller turns both into the same generic
 * "try again shortly" response, because a visitor can act on neither and the
 * difference is only useful to an attacker probing which dependency is down.
 */
export async function submitContactQuery(input: ContactQueryBody): Promise<ContactQueryResult> {
    if (!isEmailConfigured()) {
        throw serviceUnavailable("Email provider is not configured.");
    }

    const queryTypeLabel = QUERY_TYPE_LABELS[input.query_type];
    const submittedAt = formatSubmittedAt(new Date());

    // Every value here is escaped by renderNotificationEmail before it reaches
    // the markup, and stripped of control characters by the schema before it
    // reaches the subject.
    const html = renderNotificationEmail({
        heading: "New Website Query",
        introText: input.message,
        fields: [
            { label: "Name", value: input.full_name },
            { label: "Email", value: input.email },
            { label: "Phone", value: formatPhone(input.phone) },
            { label: "Query Type", value: queryTypeLabel },
            {
                label: "Preferred Contact",
                value: input.preferred_contact
                    ? CONTACT_METHOD_LABELS[input.preferred_contact]
                    : "Not specified",
            },
            { label: "Submitted", value: submittedAt },
        ],
        ctaLabel: `Reply to ${input.full_name}`,
        // A mailto CTA rather than an admin-console deep link: there is no
        // console screen for website enquiries (nothing is stored), so the
        // useful action is answering the person directly.
        ctaUrl: `mailto:${encodeURIComponent(input.email)}?subject=${encodeURIComponent(
            `Re: Your Swapngo enquiry (${queryTypeLabel})`,
        )}`,
    });

    const sent = await getResend().emails.send({
        from: env.emailFrom,
        to: env.contactInboxEmail,
        subject: `New Website Query - Swapngo | ${queryTypeLabel}`,
        // So hitting Reply in the inbox answers the visitor, not the sender
        // identity. Safe to pass through: the schema has already rejected any
        // control character that could break out of this header.
        replyTo: input.email,
        html,
        text: buildPlainText(input, queryTypeLabel, submittedAt),
    });

    if (sent.error) {
        // Resend reports failures in the body rather than throwing.
        throw new Error(sent.error.message);
    }
    return { provider_ref: sent.data?.id ?? null };
}

/** Plain-text alternative, for clients that don't render the HTML part. */
function buildPlainText(
    input: ContactQueryBody,
    queryTypeLabel: string,
    submittedAt: string,
): string {
    return [
        "New Website Query",
        "",
        "Customer Details",
        `Name: ${input.full_name}`,
        `Email: ${input.email}`,
        `Phone: ${formatPhone(input.phone)}`,
        `Query Type: ${queryTypeLabel}`,
        `Preferred Contact: ${
            input.preferred_contact ? CONTACT_METHOD_LABELS[input.preferred_contact] : "Not specified"
        }`,
        "",
        "Message",
        input.message,
        "",
        `Submitted: ${submittedAt}`,
    ].join("\n");
}
