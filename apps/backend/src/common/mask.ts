/**
 * Document numbers must never appear in full in audit logs or list responses
 * (§14). Only a detail view for an authorised staff member reveals the full
 * value, and that path calls this with `reveal: true`.
 */
export function maskDocumentNumber(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (trimmed.length <= 4) return "*".repeat(trimmed.length);
    return "*".repeat(trimmed.length - 4) + trimmed.slice(-4);
}

const SENSITIVE_KEYS = new Set([
    "password", "access_token", "refresh_token", "token", "service_role_key",
    "file", "file_url", "storage_path", "back_storage_path", "signed_url", "signedUrl",
]);

/**
 * Strips secrets and file locations before anything is written to audit_logs.
 * Document numbers are masked rather than removed so the trail stays useful.
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
        out[key] = value;
    }
    return out;
}
