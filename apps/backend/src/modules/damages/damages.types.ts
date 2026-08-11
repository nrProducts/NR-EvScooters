export type DamageStatus = "recorded" | "disputed" | "resolved";

export interface DamageRow {
    id: string;
    booking_id: string;
    rental_id: string;
    reported_by: { id: string; full_name: string } | null;
    amount: number;
    description: string;
    /** Signed URLs, minted fresh on every read — never the raw storage paths. */
    photo_urls: string[];
    deposit_deduction: number;
    outstanding_amount: number;
    status: DamageStatus;
    created_at: string;
    disputed_at: string | null;
    disputed_by: { id: string; full_name: string } | null;
    dispute_reason: string | null;
    dispute_resolved_at: string | null;
    dispute_resolution_notes: string | null;
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
    sortBy: "created_at" | "amount";
    sortDir: "asc" | "desc";
}
