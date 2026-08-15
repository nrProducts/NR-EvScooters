export type RefundStatus = "pending" | "processing" | "success" | "failed";
export type RefundType = "deposit" | "booking_cancellation";

/** Just enough of the source booking for the admin Refunds table to render without a second round trip. */
export interface RefundBookingSummary {
    id: string;
    cancelled_at: string | null;
    cancellation_reason: string | null;
    cancellation_penalty_amount: number | null;
    plan_price_at_cancellation: number | null;
    vehicle_model_name: string | null;
    station_name: string | null;
    rider_name: string | null;
    rider_phone: string | null;
}

export interface RefundRow {
    id: string;
    deposit_id: string;
    booking_id: string;
    amount: number;
    status: RefundStatus;
    refund_type: RefundType;
    gateway_refund_id: string | null;
    source_gateway_payment_id: string | null;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    processed_at: string | null;
    created_at: string;
    /** Only populated for refund_type='booking_cancellation'. */
    booking: RefundBookingSummary | null;
}

export interface ListRefundsFilters {
    page: number;
    pageSize: number;
    status?: RefundStatus;
    refundType?: RefundType;
    bookingId?: string;
    sortBy: "created_at" | "amount";
    sortDir: "asc" | "desc";
}
