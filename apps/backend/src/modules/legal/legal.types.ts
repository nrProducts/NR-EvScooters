/**
 * Terms & Conditions: the document, and proof a rider accepted it.
 *
 * Kept separate from the consent module on purpose. Consent (DPDPA ss.5-6)
 * establishes a lawful basis for PROCESSING DATA; acceptance here forms the
 * RENTAL CONTRACT — the thing that makes a late fee or a damage deduction
 * collectable. They version independently and a rider can be up to date on
 * one while owing the other.
 */

export type LegalDocumentType = "terms";

export type LegalLanguage = "en" | "ta";

export type LegalSource = "mobile" | "web" | "admin" | "import";

/** What the app renders. `body` is already resolved to one language. */
export interface LegalDocumentView {
    id: string;
    doc_type: LegalDocumentType;
    version: string;
    effective_from: string;
    /**
     * The language actually served, which is NOT always the one asked for —
     * see `getDocumentView`. A rider reading Tamil must be able to tell they
     * are looking at the English text.
     */
    language: LegalLanguage;
    /** Markdown, limited to what the app's Markdown component renders. */
    body: string;
    body_sha256: string;
}

/**
 * Whether the rider owes an acceptance, and of what.
 *
 * `up_to_date` is false both when nothing was ever accepted AND when what
 * was accepted is an older version — the same shape, and the same reason, as
 * the consent module's `up_to_date`. The routing gate reads only this.
 */
export interface LegalAcceptanceState {
    doc_type: LegalDocumentType;
    current_version: string;
    up_to_date: boolean;
    accepted_version: string | null;
    accepted_at: string | null;
}

export interface LegalAcceptanceContext {
    source: LegalSource;
    /** Set only when staff recorded the acceptance for the rider. */
    actorId: string | null;
}
