export interface CancellationTierRow {
    id: string;
    /** Cancelling at ≤ this many minutes after the booking was created falls in this tier. */
    upto_minutes: number;
    /** Percent of the plan amount paid kept back as a penalty (0–100). */
    penalty_percent: number;
    updated_at: string | null;
}

export interface CancellationTierInput {
    upto_minutes: number;
    penalty_percent: number;
}

/** The whole policy is replaced at once — the admin edits a list and saves. */
export interface ReplaceCancellationTiersInput {
    tiers: CancellationTierInput[];
}
