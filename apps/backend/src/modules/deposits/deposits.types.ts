/**
 * `deposit_status` has four values, not five.
 *
 * `partially_refunded` and `refunded` collapsed into `released`. That is not a
 * loss: how much came back is the refund's business, and a deposit that was
 * partly returned is still, from the deposit's point of view, released. The
 * old pair forced the deposit row to duplicate an amount the refund already
 * knew, and the two could disagree.
 */
export type DepositStatus = "pending" | "held" | "released" | "forfeited";

/**
 * Where this deposit stands on being paid back, derived — never stored.
 *
 * `status` answers "is the money still with us"; this answers "may it go
 * back yet", which is a different question with a different input (the
 * rider's completed rental days against the threshold frozen on the
 * deposit). Storing it would be a third opinion that drifts as days pass.
 */
export type DepositRefundEligibility = "not_eligible" | "eligible" | "refund_processed";

export interface DepositRow {
    id: string;
    /**
     * The agreement this deposit secures.
     *
     * Was `booking_id`. A deposit is taken when the subscription is created
     * (on payment capture), and it survives every renewal — attaching it to
     * the booking meant it was pinned to the reservation rather than to the
     * thing it actually secures.
     */
    subscription_id: string;
    amount: number;
    status: DepositStatus;
    held_at: string | null;
    /** `refund_eligible_on` — a DATE now, not a timestamp. */
    refund_eligible_at: string | null;
    /** `released_at`. */
    refunded_at: string | null;
    forfeited_at: string | null;
    forfeit_reason: string | null;
    /**
     * How much of `amount` is actually refundable, after non-disputed damage.
     *
     * Computed, never stored. `damages.deposit_deduction` is gone — the
     * settlement decides what the deposit covers, and a per-damage
     * "deduction" column was a second opinion on the same arithmetic.
     */
    refundable_amount: number;
    /**
     * Cumulative rental days this deposit requires before it may be refunded,
     * frozen from the plan when the rider paid.
     *
     * 0 means no threshold — every deposit taken before the onboarding-charge
     * split, which is how those riders stay on the terms they agreed to.
     */
    min_rental_days_required: number;
    /**
     * The rider's completed rental days, summed across their whole history
     * (see cumulativeRentalDaysForUser). 0 when there is no threshold to
     * measure against — the count is not computed for deposits that do not
     * need it.
     */
    rental_days_completed: number;
    refund_eligibility: DepositRefundEligibility;
    /**
     * Who this deposit belongs to. A `subscription_id` is not something staff
     * can look at and know whose money it is, so the rider comes with it.
     */
    rider: { id: string; full_name: string; phone: string | null } | null;
    booking_id: string | null;
    vehicle_model_name: string | null;
    /**
     * The NON-REFUNDABLE onboarding charge paid alongside this deposit,
     * snapshotted on the booking. Not part of `amount` — it never was the
     * rider's money to get back — but shown beside it so staff can see the
     * whole of what was collected up front.
     */
    onboarding_charge_amount: number;
    created_at: string;
}

export interface ListDepositsFilters {
    page: number;
    pageSize: number;
    status?: DepositStatus;
    /** Only deposits whose refund_eligible_on has passed and are still 'held'. */
    refundEligible?: boolean;
}
