/**
 * Revenue & financial reporting — shared types.
 *
 * The whole surface (dashboard Revenue Overview + the Revenue screen) is a
 * projection of ONE engine, `computeRevenue()` in revenue.service.ts, so the
 * two can never disagree. Security deposits are tracked entirely separately
 * and never counted as revenue.
 */

export type RevenueGranularity = "daily" | "weekly" | "monthly" | "yearly";

/** Non-deposit revenue classes, from the invoice_items breakdown. */
export type RevenueType =
    | "rental"
    | "renewal"
    | "late_fee"
    | "damage"
    | "additional_charge"
    | "discount";

export const REVENUE_TYPE_LABEL: Record<RevenueType, string> = {
    rental: "New Rental / Booking",
    renewal: "Renewal",
    late_fee: "Late Fee",
    damage: "Damage Charge",
    additional_charge: "Additional Charge",
    discount: "Discount",
};

/** A row in the detailed transaction table. */
export type RevenueTxnType =
    | "rental_payment"
    | "renewal_payment"
    | "late_fee"
    | "additional_charge"
    | "damage_charge"
    | "security_deposit"
    | "security_deposit_refund"
    | "refund";

export interface RevenueMoneyFigures {
    /** Non-deposit money collected in the window (net of discounts). */
    gross: number;
    /** Completed refunds that reverse revenue (booking_cancellation + goodwill). */
    refunds: number;
    /** gross − refunds. */
    net: number;
    lateFees: number;
    additionalCharges: number;
    damageCharges: number;
}

export interface DepositFigures {
    /** Deposits actually taken in the window (deposits.held_at). */
    collected: number;
    /** Deposit money returned to riders (deposit_release + settlement refunds, succeeded). */
    refunded: number;
    /** Deposit consumed by charges (settlements + forfeitures). */
    adjusted: number;
    /** Point-in-time: deposits still held by SwapNgo (status = 'held'). Not window-scoped. */
    held: number;
}

export interface RevenueSummary extends RevenueMoneyFigures {
    range: { from: string; to: string };
    deposits: DepositFigures;
    /** Count of refunds currently awaiting review/processing (status = 'pending'). Point-in-time. */
    pendingRefunds: number;
    /** Same figures for the immediately-preceding window of equal length, when a comparison was requested. */
    previous?: RevenueMoneyFigures & { deposits: DepositFigures };
    /** Percentage change vs `previous` (null when previous is 0 or absent). */
    deltaPct?: Partial<Record<keyof RevenueMoneyFigures | "depositsCollected", number | null>>;
}

export interface RevenueTrendPoint {
    bucket: string; // YYYY-MM-DD | YYYY-'W'WW | YYYY-MM | YYYY
    gross: number;
    refunds: number;
    net: number;
    lateFees: number;
    additionalCharges: number;
}

export interface RevenueByTypeRow {
    type: RevenueType | "gross";
    label: string;
    amount: number;
    count: number;
    pct: number;
}

export interface RefundBreakdown {
    total: number;      // gross_amount of all refunds initiated in the window
    completed: number;  // succeeded amount
    pending: number;    // pending + processing amount
    failed: number;     // failed amount
    rejected: number;   // rejected gross_amount
    count: number;
    avg: number;        // completed / completedCount
    byReason: { reason: string; label: string; amount: number; count: number }[];
}

export interface RevenueByMethodRow {
    method: string; // upi | card | netbanking | wallet | cash | other
    amount: number;
    count: number;
}

export interface RevenueTransactionRow {
    id: string;
    kind: "payment" | "refund";
    bookingId: string | null;
    riderName: string;
    riderId: string;
    vehicleNumber: string | null;
    date: string;
    type: RevenueTxnType;
    method: string | null;
    gross: number;
    refund: number;
    deposit: number;
    lateFee: number;
    additionalCharge: number;
    net: number;
    paymentStatus: string | null;
    refundStatus: string | null;
}

export interface RevenueTransactionFilters {
    from: string;
    to: string;
    search?: string;
    riderId?: string;
    vehicleId?: string;
    type?: RevenueTxnType;
    method?: string;
    paymentStatus?: string;
    refundStatus?: string;
    page: number;
    pageSize: number;
    sortBy: "date" | "gross" | "net";
    sortDir: "asc" | "desc";
}
