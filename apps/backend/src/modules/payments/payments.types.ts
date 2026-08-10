export type PaymentPurpose = "booking_initial" | "weekly_due" | "damage_settlement" | "other";
export type PaymentOrderStatus = "created" | "attempted" | "paid" | "failed" | "expired";

export interface CreateOrderResult {
    /** payment_orders.id — our internal id, not the gateway's. */
    orderId: string;
    gatewayOrderId: string;
    /** Rupees. */
    amount: number;
    currency: string;
    /** Razorpay's PUBLIC key id — safe to send to the client, never the secret. */
    keyId: string;
    /**
     * True when no RAZORPAY_KEY_ID/SECRET is configured yet. The order is
     * already settled server-side with temp data by the time this response
     * goes out — the client must skip Razorpay Checkout and /payments/verify
     * entirely and treat the booking/invoice as paid immediately. Once real
     * keys are set, this flips to false with no client change needed.
     */
    mock: boolean;
}

export interface VerifyPaymentInput {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}
