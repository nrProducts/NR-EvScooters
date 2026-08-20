export type ConsentPurpose =
    | "kyc_identity_verification"
    | "service_delivery"
    | "payments_and_billing"
    | "safety_and_incident"
    | "service_communications"
    | "marketing_communications"
    | "location_services";

export type ConsentAction = "granted" | "withdrawn";
export type ConsentLanguage = "en" | "ta";
export type ConsentSource = "mobile" | "web" | "admin" | "import";

/** A published notice. `body` is resolved to the requested language. */
export interface ConsentNoticeView {
    id: string;
    version: string;
    effective_from: string;
    language: ConsentLanguage;
    body: string;
    body_sha256: string;
    purposes: ConsentPurpose[];
    /** Split out so the client does not have to know the required list. */
    required_purposes: ConsentPurpose[];
    optional_purposes: ConsentPurpose[];
}

export interface ConsentStateItem {
    purpose: ConsentPurpose;
    required: boolean;
    granted: boolean;
    /** Null when the rider has never decided on this purpose. */
    decided_at: string | null;
    notice_version: string | null;
}

export interface ConsentState {
    /** The version every decision must be measured against. */
    current_notice_version: string;
    /**
     * True when every required purpose is granted against the CURRENT notice
     * version. The mobile app uses this alone to decide whether to show the
     * consent screen, which makes re-consent on a new notice free.
     */
    up_to_date: boolean;
    items: ConsentStateItem[];
}

export interface ConsentHistoryItem {
    id: string;
    purpose: ConsentPurpose;
    action: ConsentAction;
    notice_version: string;
    language: ConsentLanguage;
    source: ConsentSource;
    /** Set only when a staff member recorded the decision for the rider. */
    recorded_by: { id: string; full_name: string } | null;
    created_at: string;
}
