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
    created_at: string;
}

export interface ListDepositsFilters {
    page: number;
    pageSize: number;
    status?: DepositStatus;
    /** Only deposits whose refund_eligible_on has passed and are still 'held'. */
    refundEligible?: boolean;
}
