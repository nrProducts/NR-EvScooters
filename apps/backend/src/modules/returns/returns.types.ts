import { AdminRentalRow } from "../rentals/rentals.types";
import { DamageRow } from "../damages/damages.types";
import { DepositRow } from "../deposits/deposits.types";

export type ReturnSettlementStatus =
    | "pending_refund" | "refund_processing" | "refund_completed"
    | "no_refund_required" | "amount_due" | "settlement_completed";

export interface OtherCharge {
    label: string;
    amount: number;
}

export interface ReturnSettlementRow {
    id: string;
    rental_id: string;
    booking_id: string;
    user_id: string;
    vehicle_id: string;
    deposit_amount: number;
    late_fee_amount: number;
    damage_fee_amount: number;
    other_charges: OtherCharge[];
    other_charges_amount: number;
    total_charges: number;
    net_settlement: number;
    refund_amount: number;
    due_amount: number;
    status: ReturnSettlementStatus;
    refund_id: string | null;
    due_invoice_id: string | null;
    processed_by: { id: string; full_name: string } | null;
    created_at: string;
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
    sortBy: "created_at" | "processed_at";
    sortDir: "asc" | "desc";
}
