export type PaymentPurpose = "booking_initial" | "weekly_due" | "damage_settlement" | "other";
export type PaymentOrderStatus = "created" | "attempted" | "paid" | "failed" | "expired";

/** One line of what the rider is about to pay. Signed — discounts negative. */
export interface OrderLine {
    description: string;
    /** Rupees. Negative for a discount. */
    amount: number;
}

export interface CreateOrderResult {
    /** payment_orders.id — our internal id, not the gateway's. */
    orderId: string;
    gatewayOrderId: string;
    /** Rupees. The client converts to paise for Checkout; it never chooses this. */
    amount: number;
    currency: string;
    /** Razorpay's PUBLIC key id — safe to send to the client, never the secret. */
    keyId: string;
    /**
     * When this checkout session stops being collectable, ISO-8601. The
     * vehicle hold expires alongside it, so the client can show a countdown
     * and stop offering a sheet that will fail.
     */
    expiresAt: string | null;
    /**
     * The itemised breakdown behind `amount`, straight from `invoice_items`
     * plus any late fee.
     *
     * Sent because the client CANNOT derive it. Pricing rules (transaction
     * fee, welcome discount, plan-scoped charges) are resolved server-side by
     * `apply_period_adjustments`, so a client adding `plan.price + deposit`
     * gets a different number — which is exactly what happened: the review
     * screen quoted ₹3,800 and Checkout asked for ₹3,645.
     *
     * The alternative — reimplementing rule resolution on the device — is the
     * thing this architecture exists to prevent. So the server computes, and
     * the client displays what it is told.
     */
    lines: OrderLine[];
}

/**
 * There is deliberately no `mock` flag here any more.
 *
 * It used to mean "the backend has no Razorpay keys, so the order was already
 * settled server-side — skip Checkout and treat this as paid". That handed
 * out free confirmed bookings on any deploy where a secret was blank. The
 * server-side branch is gone; a client that cannot reach the gateway must
 * fail, not succeed.
 */

export interface VerifyPaymentInput {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
}
