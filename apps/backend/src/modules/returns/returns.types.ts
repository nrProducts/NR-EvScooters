import { AdminRentalRow } from "../rentals/rentals.types";
import { DamageRow } from "../damages/damages.types";
import { DepositRow } from "../deposits/deposits.types";

/**
 * `return_settlements` is `rental_settlements`, and it is a much stricter
 * table: the database now CHECKS the arithmetic — `net_amount` must equal the
 * deposit less the charges, and `outcome` must agree with its sign. The old
 * table let the six money columns say whatever the application wrote.
 *
 * The six-value `status` collapsed into a three-value `outcome`
 * (`refund_due` / `amount_due` / `balanced`). The missing states were not
 * settlement states at all — `refund_processing`, `refund_completed` and
 * `pending_refund` described the REFUND, which has its own status column and
 * is reachable through `refund_id`. Keeping a mirror of it here is exactly the
 * kind of drift the migration removes elsewhere.
 *
 * The wire type below therefore still reports `status`, derived from the
 * outcome plus the linked refund, so neither app has to change yet.
 */
export type ReturnSettlementStatus =
    | "pending_refund" | "refund_processing" | "refund_completed"
    | "no_refund_required" | "amount_due" | "settlement_completed";

export interface OtherCharge {
    label: string;
    amount: number;
}

export interface ReturnSettlementRow {
    /** The settlement is keyed by rental — there is one per rental, at most. */
    id: string;
    rental_id: string;
    booking_id: string | null;
    user_id: string;
    vehicle_id: string | null;
    /** `deposit_amount_snapshot`. */
    deposit_amount: number;
    late_fee_amount: number;
    /** `damage_amount`. */
    damage_fee_amount: number;
    /**
     * The itemised list has no column.
     *
     * `rental_settlements` stores `other_charges_amount` as a single figure,
     * so the labels are not persisted. They are still accepted on input and
     * written to the audit entry, which is where the breakdown of a
     * staff-entered charge belongs; this array is empty on read-back.
     */
    other_charges: OtherCharge[];
    other_charges_amount: number;
    /** `total_charges_amount`. */
    total_charges: number;
    /** `net_amount` — positive means money back to the rider. */
    net_settlement: number;
    refund_amount: number;
    due_amount: number;
    status: ReturnSettlementStatus;
    refund_id: string | null;
    /** `invoice_id` — the invoice raised when the rider owes money. */
    due_invoice_id: string | null;
    /** `settled_by_user_id`. */
    processed_by: { id: string; full_name: string } | null;
    created_at: string;
    /** `settled_at`. */
    processed_at: string | null;
}

/** Everything the admin Return Detail page needs in one call. */
export interface ReturnDetailView {
    rental: AdminRentalRow;
    deposit: DepositRow | null;
    damages: DamageRow[];
    latePreview: { daysLate: number; penaltyAmount: number; feePerDay: number };
    settlement: ReturnSettlementRow | null;
}

export interface DamageItemInput {
    amount: number;
    description: string;
    photoPaths: string[];
}

export interface ApproveReturnSettlementInput {
    damageItems: DamageItemInput[];
    lateFeeOverride?: number;
    otherCharges: OtherCharge[];
    endBatteryPct?: number;
}

export interface ListSettlementsFilters {
    page: number;
    pageSize: number;
    status?: ReturnSettlementStatus;
    sortBy: "created_at" | "settled_at";
    sortDir: "asc" | "desc";
}
