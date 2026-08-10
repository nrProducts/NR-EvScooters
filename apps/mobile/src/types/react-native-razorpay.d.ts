/**
 * react-native-razorpay ships no TypeScript types (see node_modules — only a
 * plain RazorpayCheckout.js). This is the minimal shape lib/razorpayCheckout.ts
 * actually uses, per Razorpay's own Checkout options/response documentation.
 */
declare module 'react-native-razorpay' {
    export interface RazorpayCheckoutOptions {
        key: string;
        amount: number; // paise
        currency: string;
        order_id: string;
        name?: string;
        description?: string;
        image?: string;
        prefill?: { email?: string; contact?: string; name?: string };
        theme?: { color?: string };
        notes?: Record<string, string>;
    }

    export interface RazorpaySuccessResponse {
        razorpay_payment_id: string;
        razorpay_order_id: string;
        razorpay_signature: string;
    }

    export interface RazorpayErrorResponse {
        code?: number;
        description?: string;
        error?: { code?: string; description?: string; reason?: string };
    }

    export default class RazorpayCheckout {
        static open(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessResponse>;
    }
}
