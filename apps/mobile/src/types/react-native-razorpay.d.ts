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
        /** Defaulted to 'Swapngo' by openRazorpayCheckout; override per call if ever needed. */
        name?: string;
        description?: string;
        image?: string;
        prefill?: { email?: string; contact?: string; name?: string };
        theme?: { color?: string };
        notes?: Record<string, string>;
        /**
         * Payment-method display config. Reorders and groups what the sheet
         * shows; it cannot enable an instrument the merchant account does not
         * already offer. See Razorpay's "Configure Payment Methods" docs.
         */
        config?: {
            display: {
                // Readonly throughout so a caller can declare the config with
                // `as const` — which is how it should be declared, since it is
                // fixed data rather than something built per payment.
                blocks: Readonly<Record<string, {
                    readonly name: string;
                    readonly instruments: readonly {
                        readonly method: 'upi' | 'card' | 'wallet' | 'netbanking' | 'emi';
                        /** e.g. ['google_pay', 'phonepe'] — omit to allow all. */
                        readonly apps?: readonly string[];
                        readonly types?: readonly string[];
                        readonly issuers?: readonly string[];
                    }[];
                }>>;
                /** Order of blocks, each referenced as `block.<name>`. */
                sequence: readonly string[];
                preferences?: {
                    /** false hides every instrument not named in `blocks`. */
                    show_default_blocks?: boolean;
                };
            };
        };
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
