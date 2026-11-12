/** Stage 2 — Razorpay settlements, and the exceptions queue they feed. */

export type StatementSource = "razorpay" | "hdfc";
export type LineMatchStatus = "unmatched" | "matched" | "exception" | "resolved" | "ignored";

export interface StatementRow {
    id: string;
    source: StatementSource;
    externalRef: string;
    accountRef: string | null;
    utr: string | null;
    statementDate: string;
    periodFrom: string | null;
    periodTo: string | null;
    grossAmount: number;
    refundAmount: number;
    /** Razorpay: fee INCLUDING its GST. */
    feeAmount: number;
    /** The GST part of the fee — input tax credit. */
    taxAmount: number;
    netAmount: number;
    openingBalance: number | null;
    closingBalance: number | null;
    lineCount: number;
    openExceptions: number;
    status: "balanced" | "exceptions";
    statusNote: string | null;
    /** hdfc credit lines that point at this settlement (Stage 3). */
    bankMatched: boolean;
    syncedAt: string;
}

export interface StatementLineRow {
    id: string;
    statementId: string;
    source: StatementSource;
    lineNo: number;
    externalId: string | null;
    kind: "payment" | "refund" | "adjustment" | "transfer" | "bank_credit" | "bank_debit";
    occurredAt: string | null;
    valueDate: string | null;
    amount: number;
    netAmount: number;
    fee: number;
    tax: number;
    method: string | null;
    gatewayOrderId: string | null;
    description: string | null;
    runningBalance: number | null;
    counterpartyKey: string | null;
    category: string | null;
    categorySource: "auto" | "learned" | "manual" | null;
    matchStatus: LineMatchStatus;
    exceptionCode: string | null;
    paymentTransactionId: string | null;
    refundId: string | null;
    matchedStatementId: string | null;
    riderId: string | null;
    riderName: string | null;
    billNumber: string | null;
    resolvedAt: string | null;
    resolvedNote: string | null;
}

export interface StatementDetail extends StatementRow {
    lines: StatementLineRow[];
}

export interface SettlementMonthSummary {
    month: string;
    from: string;
    to: string;
    /** Razorpay payments captured in the month (gross). */
    captured: number;
    capturedCount: number;
    /** Gateway refunds paid out in the month. */
    refunded: number;
    /** Fees on settlements dated in the month, excluding GST. */
    fees: number;
    /** GST on those fees — claimable as input tax credit. */
    feeGst: number;
    /** What those settlements paid into the bank. */
    settled: number;
    settlementCount: number;
    /** Captured by month-end but in no settlement dated by then (gross). */
    inTransitAtEnd: number;
    inTransitCount: number;
    openExceptions: number;
    /** First day a settlement was synced — figures before it are incomplete. */
    syncedSince: string | null;
}

export interface ExceptionRow {
    /** A statement line id, or for E2/E3 the payment/refund id it is about. */
    id: string;
    code: string;
    kind: "line" | "unsettled";
    lineId: string | null;
    statementId: string | null;
    externalId: string | null;
    amount: number;
    occurredAt: string | null;
    riderId: string | null;
    riderName: string | null;
    gatewayOrderId: string | null;
    description: string | null;
    status: LineMatchStatus | "open";
    resolvedAt: string | null;
    resolvedNote: string | null;
}
