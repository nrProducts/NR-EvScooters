export type DepositStatus = "pending" | "held" | "partially_refunded" | "refunded" | "forfeited";

export interface DepositRow {
    id: string;
    booking_id: string;
    amount: number;
    status: DepositStatus;
    held_at: string | null;
    refund_eligible_at: string | null;
    refunded_at: string | null;
    forfeited_at: string | null;
    refund_id: string | null;
    /** Sum of deposit_deduction across non-disputed damages for this booking — how much of `amount` is actually refundable. */
    refundable_amount: number;
    created_at: string;
}

export interface ListDepositsFilters {
    page: number;
    pageSize: number;
    status?: DepositStatus;
    /** Only deposits whose refund_eligible_at has passed and are still 'held'. */
    refundEligible?: boolean;
}
