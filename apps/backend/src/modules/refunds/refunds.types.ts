/**
 * `refund_status` uses `succeeded`, matching `payment_status` — the old
 * `success` was the odd one out across the two tables.
 */
export type RefundStatus = "pending" | "processing" | "succeeded" | "failed";

/**
 * `refund_reason`. Was `refund_type` with two values; there are four now, and
 * they say WHY rather than what kind:
 *
 *   deposit_release     — the post-return deposit release (was `deposit`)
 *   booking_cancellation— unchanged
 *   settlement          — a return settlement paying money back
 *   goodwill            — a discretionary refund, which had no expression at all
 */
export type RefundType = "deposit_release" | "booking_cancellation" | "settlement" | "goodwill";

/** Just enough of the source booking for the admin Refunds table to render. */
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
    /**
     * The deposit this refund releases, when it releases one.
     *
     * `refunds.deposit_id` is gone — a refund reverses a PAYMENT, and tying it
     * to a deposit could not express a refund of a plan fee. Resolved through
     * the subscription for display; null for a refund that is not about a
     * deposit at all.
     */
    deposit_id: string | null;
    /** Resolved through the payment's order → subscription → booking. */
    booking_id: string | null;
    user_id: string;
    amount: number;
    status: RefundStatus;
    /** `refunds.reason`. */
    refund_type: RefundType;
    gateway_refund_id: string | null;
    /**
     * `payment_transactions.gateway_payment_id` for the payment being
     * reversed. Was a denormalised column; it is a join now, and NOT NULL —
     * a refund with no originating payment cannot be reconciled.
     */
    source_gateway_payment_id: string | null;
    payment_transaction_id: string;
    attempt_count: number;
    last_attempted_at: string | null;
    failure_reason: string | null;
    initiated_at: string;
    /** `completed_at`. */
    processed_at: string | null;
    created_at: string;
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
