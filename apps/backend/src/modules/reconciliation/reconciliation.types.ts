export interface ReconciliationFilters {
    /** ISO date, inclusive. */
    from: string;
    /** ISO date, inclusive. */
    to: string;
}

export interface UnmatchedInternalPayment {
    gatewayPaymentId: string;
    amount: number;
    appliedAt: string;
}

export interface MissingGatewayPayment {
    gatewayPaymentId: string;
    /** Rupees — Razorpay reports paise. */
    amount: number;
    status: string;
    createdAt: string;
}

export interface FailedWebhookEvent {
    id: string;
    eventType: string;
    signatureValid: boolean;
    processed: boolean;
    error: string | null;
    receivedAt: string;
}

export interface ReconciliationReport {
    range: { from: string; to: string };
    internalPaymentCount: number;
    gatewayPaymentCount: number;
    /** In our payment_transactions but not found in Razorpay's payment list for the range — investigate immediately. */
    unmatchedInternal: UnmatchedInternalPayment[];
    /** Captured at the gateway but never landed in payment_transactions — usually a missed/failed webhook. */
    missingInternal: MissingGatewayPayment[];
    /** Webhook deliveries that failed signature verification or were never successfully processed. */
    failedWebhooks: FailedWebhookEvent[];
    /** True when the gateway wasn't queried (no keys configured) — internal-only figures are shown. */
    gatewayUnavailable: boolean;
}
