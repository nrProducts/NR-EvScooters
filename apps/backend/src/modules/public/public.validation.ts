import { z } from "zod";

/**
 * The public website's contact/query form. This is the ONLY unauthenticated
 * write in the API, so the schema is the security boundary, not a convenience
 * — the browser's own validation is a UX nicety and is re-checked here in
 * full.
 */

export const QUERY_TYPES = [
    "general",
    "rental",
    "pricing",
    "booking",
    "partnership",
    "vehicle",
    "payment",
    "technical",
    "feedback",
    "other",
] as const;

export const CONTACT_METHODS = ["email", "phone", "whatsapp"] as const;

/** Display labels — used in the email so staff read words, not slugs. */
export const QUERY_TYPE_LABELS: Record<(typeof QUERY_TYPES)[number], string> = {
    general: "General Enquiry",
    rental: "Scooter Rental",
    pricing: "Pricing & Plans",
    booking: "Booking",
    partnership: "Partnership",
    vehicle: "Vehicle / Scooter",
    payment: "Payment",
    technical: "Technical Support",
    feedback: "Feedback",
    other: "Other",
};

export const CONTACT_METHOD_LABELS: Record<(typeof CONTACT_METHODS)[number], string> = {
    email: "Email",
    phone: "Phone",
    whatsapp: "WhatsApp",
};

export const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;

const TAB = 9;
const LINE_FEED = 10;
const SPACE = 32;
const DELETE = 127;
const C1_END = 159;

/**
 * Removes C0/C1 control characters.
 *
 * Every one of these values ends up in an email — the name and query type in
 * the SUBJECT, the email address in Reply-To. A newline in any of those is a
 * header-injection attempt (`\r\nBcc: ...`). Resend takes structured fields
 * rather than a raw header blob so it is not trivially exploitable, but the
 * defence belongs at the parse boundary regardless, and it also stops a
 * subject line being visually mangled by a stray tab.
 *
 * Written as a code-point scan rather than a regex so this file contains no
 * control characters of its own to be mangled by an editor or a diff.
 *
 * @param keepBreaks Retain tab and newline (the multi-line message field).
 *                   Otherwise every control becomes a space, which the
 *                   whitespace collapse below then folds away.
 */
function stripControlChars(value: string, keepBreaks: boolean): string {
    let out = "";
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        const isControl = code < SPACE || (code >= DELETE && code <= C1_END);
        if (!isControl) {
            out += char;
        } else if (keepBreaks && (code === LINE_FEED || code === TAB)) {
            out += char;
        } else if (!keepBreaks) {
            out += " ";
        }
    }
    return out;
}

/** Collapses to a single trimmed line, controls removed. */
const singleLine = (max: number) =>
    z
        .string()
        .transform((v) => stripControlChars(v, false).replace(/\s+/g, " ").trim())
        .pipe(z.string().max(max));

/**
 * Indian mobile numbers. Accepts what a person actually types — `+91 98765
 * 43210`, `098765 43210`, `9876543210` — then requires the canonical shape:
 * 10 digits starting 6-9, optionally preceded by 91 or 0. Stored as the bare
 * 10 digits so two spellings of one number are one number.
 */
const indianPhone = z
    .string()
    .transform((v) => v.replace(/[\s()+.-]/g, ""))
    .pipe(
        z.string().regex(/^(?:91|0)?[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
    )
    .transform((digits) => digits.replace(/^(?:91|0)/, ""));

export const contactQueryBody = z.object({
    full_name: singleLine(100).pipe(z.string().min(2, "Enter your full name.")),

    email: singleLine(254)
        .pipe(z.email("Enter a valid email address."))
        .transform((v) => v.toLowerCase()),

    phone: indianPhone,

    query_type: z.enum(QUERY_TYPES, { message: "Choose a query type." }),

    message: z
        .string()
        .transform((v) => stripControlChars(v, true).trim())
        .pipe(
            z
                .string()
                .min(MESSAGE_MIN, `Please write at least ${MESSAGE_MIN} characters.`)
                .max(MESSAGE_MAX, `Please keep your message under ${MESSAGE_MAX} characters.`),
        ),

    /** Optional — the form leaves it unset unless the visitor picks one. */
    preferred_contact: z.enum(CONTACT_METHODS).optional(),

    /**
     * Honeypot. A real visitor never sees this field (it is hidden from both
     * sight and the accessibility tree), so anything in it is a bot filling
     * every input on the page. Rejected as a plain validation error rather
     * than a distinct status, so a scraper can't tell the trap apart from a
     * genuine mistake.
     */
    company: z.string().max(0).optional(),
});

export type ContactQueryBody = z.infer<typeof contactQueryBody>;
