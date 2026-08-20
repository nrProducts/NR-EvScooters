/**
 * One table became three: `incidents` (what happened, with the photos),
 * `damages` (what it costs) and `damage_disputes` (the rider's objection).
 *
 * That separation earns its keep. An incident that turns out to cost nothing
 * — a scratch written off, a theft report that was a misplaced key — now has
 * somewhere to live; before, "damage" and "something happened" were the same
 * row, so a zero-cost incident either got a £0 damage record or vanished.
 * A dispute is likewise a row with its own lifecycle rather than six nullable
 * columns hanging off the charge.
 *
 * `damage_status` reflects the merge: `recorded` is `assessed`, and `settled`
 * and `waived` are new terminal states the old three couldn't express.
 */
export type DamageStatus = "assessed" | "disputed" | "settled" | "waived";

export interface DamageRow {
    id: string;
    /** Resolved through the incident's rental → subscription → booking. */
    booking_id: string | null;
    /** `incidents.rental_id`. */
    rental_id: string | null;
    /** `incidents.reported_by_user_id`. */
    reported_by: { id: string; full_name: string } | null;
    /** `damages.assessed_amount`. */
    amount: number;
    /** `incidents.description`; `damages.notes` when the assessor added detail. */
    description: string;
    /** Signed URLs from `incidents.photo_paths`, minted fresh on every read. */
    photo_urls: string[];
    /**
     * How much of this damage the deposit covers, and what is billed
     * separately.
     *
     * Both were columns; both are derived now. They were a per-damage opinion
     * about a question only the whole settlement can answer — with two damages
     * and one deposit, each row's "deduction" depended on the other, and
     * nothing kept them consistent.
     */
    deposit_deduction: number;
    outstanding_amount: number;
    status: DamageStatus;
    created_at: string;
    // --- damage_disputes, when one exists --------------------------------
    /** `raised_at`. */
    disputed_at: string | null;
    /** `raised_by_user_id`. */
    disputed_by: { id: string; full_name: string } | null;
    /** `reason`. */
    dispute_reason: string | null;
    /** `resolved_at`. */
    dispute_resolved_at: string | null;
    /** `resolution_notes`. */
    dispute_resolution_notes: string | null;
    /** `amount_held`. */
    disputed_amount_held: number | null;
}

export interface RecordDamageInput {
    amount: number;
    description: string;
}

export interface DisputeDamageInput {
    reason: string;
}

export interface ResolveDisputeInput {
    /** Admin may adjust the amount while resolving; omit to uphold the original. */
    resolved_amount?: number;
    notes: string;
}

export interface ListDamagesFilters {
    page: number;
    pageSize: number;
    bookingId?: string;
    status?: DamageStatus;
    sortBy: "created_at" | "assessed_amount";
    sortDir: "asc" | "desc";
}
