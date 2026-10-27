/**
 * Original documents taken from a rider at pickup.
 *
 * The set is deliberately short — the ones Swapngo actually takes — with an
 * "other" that must say what it is, so nothing is ever recorded as just
 * "other documents".
 */
export const ORIGINAL_DOC_TYPES = ["driving_licence", "voter_id", "marksheet", "other"] as const;
export type OriginalDocType = (typeof ORIGINAL_DOC_TYPES)[number];

export const ORIGINAL_DOC_LABEL: Record<OriginalDocType, string> = {
    driving_licence: "Driving licence",
    voter_id: "Voter ID",
    marksheet: "Marksheet",
    other: "Other",
};

export interface OriginalDocInput {
    type: OriginalDocType;
    /** Required, and only meaningful, when `type` is "other". */
    other_label?: string;
}

/**
 * The pickup decision. Always supplied — either nothing was taken, or a list of
 * what was. There is no third "not recorded" state at pickup.
 */
export type OriginalsInput = { none: true } | { documents: OriginalDocInput[] };

export interface OriginalDocumentView {
    id: string;
    doc_type: OriginalDocType;
    /** What the document is, ready to show: "Driving licence", or the text typed for "other". */
    label: string;
    status: "held" | "returned";
    received_at: string;
    received_by: { id: string; full_name: string } | null;
    returned_at: string | null;
}

/** One pickup's record: what was taken (if anything), by whom, when. */
export interface RentalOriginalsView {
    rental_id: string;
    taken: boolean;
    recorded_at: string;
    recorded_by: { id: string; full_name: string } | null;
    documents: OriginalDocumentView[];
}
