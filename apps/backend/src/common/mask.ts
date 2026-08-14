/**
 * Document numbers must never appear in full in audit logs or list responses
 * (§14). Only a detail view for an authorised staff member reveals the full
 * value, and that path calls this with `reveal: true`.
 *
 * Still in use for `vehicle_documents.doc_number` (registration and insurance
 * numbers). That is company data, not personal data, and is deliberately out
 * of scope for the DPDPA minimisation work — rider identity documents keep
 * only their last four digits and use `maskLast4` below.
 */
export function maskDocumentNumber(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length <= 4) return "*".repeat(trimmed.length);
    return "*".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

/**
 * Display form for a rider identity document, whose full number is no longer
 * stored — only `user_documents.doc_number_last4`. The leading dots are fixed
 * width on purpose: the real length is itself a weak signal about the document
 * type, and there is nothing to reconstruct it from anyway.
 */
export function maskLast4(last4: string | null | undefined): string | null {
    if (!last4) return null;
    return `•••• ${last4.trim().toUpperCase()}`;
}

/**
 * Keys dropped entirely. These are credentials and file locations: keeping the
 * key at all would tell a reader that a secret was involved without adding
 * anything useful.
 */
const SENSITIVE_KEYS = new Set([
    "password", "access_token", "refresh_token", "token", "service_role_key",
    "file", "file_url", "storage_path", "back_storage_path", "signed_url", "signedUrl",
]);

/**
 * Keys whose VALUE is replaced with "[redacted]" but whose presence is kept.
 *
 * The distinction from SENSITIVE_KEYS matters. An audit trail's job is to prove
 * *which* field an actor changed; dropping the key would destroy that, while
 * keeping the value would put a rider's name, phone, address or date of birth
 * into a table that is retained for years and is itself outside the erasure
 * path. Redaction keeps the accountability and drops the personal data.
 *
 * `state` is deliberately absent — it is coarse enough to be useful in a
 * dispute and is treated as non-identifying in docs/dpdpa/data-inventory.md.
 * Keep the two in step if that judgement changes.
 */
const REDACT_KEYS = new Set([
    // users
    "full_name", "email", "phone", "date_of_birth", "gender",
    "address_line_1", "address_line_2", "city", "postal_code",
    "emergency_contact_name", "emergency_contact_phone",
    "profile_photo_url", "push_token", "referral_code",
    // nominee — a third party's personal data (DPDPA s.14)
    "nominee_full_name", "nominee_phone", "nominee_email", "nominee_relationship",
    // request/telemetry
    "ip", "ip_address", "user_agent", "device_id",
    "lat", "lng", "latitude", "longitude",
    // credentials that are checked rather than stored
    "otp", "code",
]);

export const REDACTED = "[redacted]";

/**
 * Strips secrets and file locations, and redacts personal data, before
 * anything is written to audit_logs. Document numbers are masked rather than
 * removed so the trail stays useful.
 *
 * Applied one level deep only. Nested objects are passed through, so callers
 * must not hand `writeAudit` a whole nested row — pass the specific fields
 * that changed, which is what every existing call site already does.
 */
export function safeAuditPayload(
    payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
    if (!payload) return null;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
        if (SENSITIVE_KEYS.has(key)) continue;
        if (key === "doc_number" || key === "docNumber") {
            out[key] = maskDocumentNumber(String(value));
            continue;
        }
        if (REDACT_KEYS.has(key)) {
            // null stays null: "this field was not set" is not personal data,
            // and flattening it to "[redacted]" would make every diff look
            // like a change.
            out[key] = value === null || value === undefined ? value : REDACTED;
            continue;
        }
        out[key] = value;
    }
    return out;
}
