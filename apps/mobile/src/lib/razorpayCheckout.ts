import { Platform } from 'react-native';
import RazorpayCheckout, { RazorpayCheckoutOptions, RazorpaySuccessResponse } from 'react-native-razorpay';
import type { VerifyPaymentPayload } from '../types/api';

export class PaymentCancelledError extends Error {
    constructor() {
        super('Payment was cancelled.');
        this.name = 'PaymentCancelledError';
    }
}

export class PaymentUnavailableError extends Error {
    constructor() {
        super("Payment isn't available in this build yet. Please update the app and try again.");
        this.name = 'PaymentUnavailableError';
    }
}

/**
 * Opens Razorpay's native checkout sheet and returns the verify-callback
 * payload on success. Never resolves with a "failed" state — a decline,
 * cancel, or the native module being absent (e.g. a dev-client build that
 * hasn't been rebuilt since react-native-razorpay was added) all reject,
 * so callers only need a single try/catch.
 */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<VerifyPaymentPayload> {
    if (Platform.OS === 'web') {
        throw new PaymentUnavailableError();
    }

    let result: RazorpaySuccessResponse;
    try {
        result = await RazorpayCheckout.open(options);
    } catch (err) {
        const e = err as { code?: number; description?: string } | undefined;
        // Razorpay's own "user closed the sheet" code.
        if (e?.code === 2 || /cancel/i.test(e?.description ?? '')) {
            throw new PaymentCancelledError();
        }
        if (err instanceof TypeError) {
            // NativeModules.RNRazorpayCheckout is undefined — the module isn't linked.
            throw new PaymentUnavailableError();
        }
        throw new Error(e?.description ?? 'Payment failed. Please try again.');
    }

    return {
        razorpay_order_id: result.razorpay_order_id,
        razorpay_payment_id: result.razorpay_payment_id,
        razorpay_signature: result.razorpay_signature,
    };
}
