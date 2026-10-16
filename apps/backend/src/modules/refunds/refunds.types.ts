import type { DepositRow } from "../deposits/deposits.types";

/**
 * `refund_status` uses `succeeded`, matching `payment_status` — the old
 * `success` was the odd one out across the two tables.
 */
export type RefundStatus = "pending" | "processing" | "succeeded" | "failed" | "rejected";

/**
 * The itemised deductions an admin can apply during review — subtracted from
 * `gross_amount` to arrive at the payable `amount`. See the refund review
 * flow (SwapNgo bug-fix backlog, item 5).
 */
export interface RefundDeductions {
    transaction_fee: number;
    other_charges: number;
    cancellation_charge: number;
}

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
    /** Plate of the scooter handed over, null if it never was. */
    vehicle_registration_number: string | null;
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
    /** Payable amount — always `gross_amount` minus the sum of `deductions`. */
    amount: number;
    /** The pre-deduction amount, frozen at creation. */
    gross_amount: number;
    deductions: RefundDeductions;
    deduction_total: number;
    status: RefundStatus;
    /** Set once an admin has reviewed (and possibly adjusted) the refund. Approval is blocked until then. */
    reviewed_at: string | null;
    reviewed_by: { id: string; full_name: string } | null;
    review_note: string | null;
    rejected_at: string | null;
    rejected_by: { id: string; full_name: string } | null;
    rejection_reason: string | null;
    /**
     * Who approved the payout and when. No column holds this — it is read from
     * the audit trail (`refund.submitted` / `refund.processed`), so it is null
     * for a refund that was never approved and for system-completed ones.
     */
    approved_by: { id: string; full_name: string } | null;
    approved_at: string | null;
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
    /** Set by GET /refunds/me so a rider's own list can reuse this same query. */
    userId?: string;
    sortBy: "created_at" | "amount";
    sortDir: "asc" | "desc";
}

/**
 * Rider-safe projection of RefundRow for GET /refunds/me — strips who
 * reviewed/rejected it, the review note, gateway/payment identifiers and
 * retry bookkeeping. A rider needs to know what's happening to their money,
 * not which admin touched it or how many times the gateway was retried.
 */
export interface MyRefundRow {
    id: string;
    booking_id: string | null;
    amount: number;
    gross_amount: number;
    deductions: RefundDeductions;
    deduction_total: number;
    status: RefundStatus;
    refund_type: RefundType;
    rejection_reason: string | null;
    failure_reason: string | null;
    initiated_at: string;
    processed_at: string | null;
    created_at: string;
    booking: RefundBookingSummary | null;
}

export interface ReviewRefundInput {
    deductions: RefundDeductions;
    note?: string | null;
}

export interface RejectRefundInput {
    reason: string;
}

// ---------------------------------------------------------------------------
// Deposit journey — see depositJourney.service.ts
// ---------------------------------------------------------------------------


export interface JourneyPayment {
    transaction_id: string;
    gateway_payment_id: string;
    gateway_order_id: string | null;
    gateway: string;
    amount: number;
    method: "upi" | "card" | "netbanking" | "wallet" | "cash" | null;
    status: string;
    captured_at: string;
    /** Every invoice this one payment settled. */
    invoices: { invoice_id: string; invoice_number: string; purpose: string; allocated_amount: number }[];
}

export interface JourneyInvoice {
    id: string;
    invoice_number: string;
    purpose: string;
    status: string;
    issued_on: string | null;
    due_on: string | null;
    total_amount: number;
}

export interface JourneyDamage {
    id: string;
    amount: number;
    status: string;
    notes: string | null;
    created_at: string;
}

export interface JourneyRental {
    id: string;
    picked_up_at: string;
    due_back_at: string;
    returned_at: string | null;
    end_reason: string | null;
    vehicle: { name: string; registration_number: string } | null;
    return: {
        status: string;
        requested_at: string | null;
        requested_reason: string | null;
        inspected_at: string | null;
        inspection_notes: string | null;
        approved_at: string | null;
        rejected_at: string | null;
        rejection_reason: string | null;
        other_charges_amount: number;
        payment_verified_at: string | null;
    } | null;
    settlement: {
        settled_at: string;
        deposit_amount: number;
        late_fee_amount: number;
        damage_amount: number;
        other_charges_amount: number;
        total_charges: number;
        net_amount: number;
        outcome: "refund_due" | "amount_due" | "balanced";
    } | null;
}

export type JourneyTone = "success" | "info" | "warning" | "danger" | "muted";

export interface JourneyTimelineEvent {
    /** ISO instant. */
    at: string;
    kind: "payment" | "deposit" | "rental" | "return" | "settlement" | "damage" | "refund";
    tone: JourneyTone;
    title: string;
    detail: string | null;
    amount?: number;
}

export interface DepositJourney {
    /** The deposit id — the journey is one-to-one with it. */
    id: string;
    deposit: DepositRow;
    rider: { id: string; full_name: string; phone: string | null; email: string | null } | null;
    subscription: {
        id: string;
        status: string;
        started_on: string | null;
        ended_at: string | null;
        plan_name: string | null;
        vehicle_model_name: string | null;
        hub_name: string | null;
        plan_price: number;
        deposit_amount: number;
        duration_days: number | null;
        billing_period: string | null;
        booking_id: string | null;
        booking_start_on: string | null;
    };
    payments: JourneyPayment[];
    invoices: JourneyInvoice[];
    rentals: JourneyRental[];
    damages: JourneyDamage[];
    refunds: RefundRow[];
    totals: {
        collected: number;
        deposit_amount: number;
        onboarding_charge: number;
        damage_total: number;
        refunded: number;
        refund_in_flight: number;
        retained: number;
    };
    timeline: JourneyTimelineEvent[];
}
