export type RefundStatus = "pending" | "processing" | "success" | "failed";

export interface RefundRow {
    id: string;
    deposit_id: string;
    booking_id: string;
    amount: number;
    status: RefundStatus;
    gateway_refund_id: string | null;
    source_gateway_payment_id: string | null;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    processed_at: string | null;
    created_at: string;
}

export interface ListRefundsFilters {
    page: number;
    pageSize: number;
    status?: RefundStatus;
    bookingId?: string;
    sortBy: "created_at" | "amount";
    sortDir: "asc" | "desc";
}
