import { Platform } from 'react-native';
import RazorpayCheckout, { RazorpayCheckoutOptions, RazorpaySuccessResponse } from 'react-native-razorpay';
import type { VerifyPaymentPayload } from '../types/api';
import { BRAND_LOGO_DATA_URI } from './brandLogo';
import { COLORS } from '../constants/theme';

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
 * There is deliberately NO `config.display` block here.
 *
 * An earlier version promoted a "Pay by UPI or Card" block above the default
 * list. It was a mistake twice over:
 *
 *   1. It DUPLICATED Cards. Razorpay drops instruments the account cannot
 *      serve, so with UPI inactive the custom block rendered as a lone
 *      "Cards" row — and `show_default_blocks: true` then rendered Cards
 *      again underneath. The rider saw the same method listed twice.
 *
 *   2. It bought nothing. Razorpay's DEFAULT ordering already leads with UPI
 *      and Cards; that is exactly what their documented Checkout screenshots
 *      show. The custom block was reordering a list that was already in the
 *      right order.
 *
 * So the sheet is left to Razorpay. Once UPI is activated on the merchant
 * account it appears at the top on its own, with the GPay/PhonePe/Paytm icons
 * supplied by `plugins/withUpiIntentQueries.js`.
 *
 * If method order ever genuinely needs forcing, use `show_default_blocks:
 * false` and enumerate EVERY method in `sequence` — mixing a custom block with
 * the default list is what produced the duplicate.
 */

/**
 * Checkout's accent colour. Razorpay paints its header and Pay button with
 * it and puts white text on top, so it must be dark enough to read: the
 * bright brand green (#21C45D) gives white text ~2.3:1 contrast, which is
 * what made the sheet's header look washed out. The dark brand green is
 * ~4.4:1 and still reads as Swapngo.
 */
const CHECKOUT_THEME_COLOR = COLORS.primaryDark;

/**
 * The rider's phone as Razorpay wants it, or undefined.
 *
 * `users.phone` is not uniformly E.164 — OTP sign-ups store "+91XXXXXXXXXX",
 * older rows a bare 10-digit number, Google sign-ups nothing — and Checkout
 * opens on a "Contact details" form whenever the prefill is missing or does
 * not parse, putting a form in front of the payment the rider came to make.
 */
export function normalizeCheckoutContact(phone: string | null | undefined): string | undefined {
    if (!phone) return undefined;
    const digits = phone.replace(/[^\d+]/g, '');
    if (/^\+\d{10,15}$/.test(digits)) return digits;
    if (/^\d{10}$/.test(digits)) return `+91${digits}`;
    if (/^91\d{10}$/.test(digits)) return `+${digits}`;
    return undefined;
}

/** Drops blank prefill values — an empty string is shown as an empty field, not skipped. */
function cleanPrefill(prefill: RazorpayCheckoutOptions['prefill']): RazorpayCheckoutOptions['prefill'] {
    if (!prefill) return undefined;
    const email = prefill.email?.trim();
    const name = prefill.name?.trim();
    return {
        ...(email ? { email } : {}),
        ...(name ? { name } : {}),
        ...(normalizeCheckoutContact(prefill.contact) ? { contact: normalizeCheckoutContact(prefill.contact) } : {}),
    };
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
        // Applied here rather than at each of the four call sites, so the
        // ordering can never drift between the booking, renewal, invoice and
        // settlement flows. A caller may still override it.
        result = await RazorpayCheckout.open({
            // Brand name and method ordering are defaults, not per-call
            // decisions — `name` was previously repeated verbatim at all four
            // call sites, which is how a rename ends up half-applied.
            //
            name: 'Swapngo',
            // Replaces Razorpay's generated letter placeholder (the bare "S").
            // The dashboard's Checkout Styling logo should ALSO be set — it
            // covers Payment Links and receipts, which this does not — but it
            // needs an activated account, and this works today. Same artwork
            // either way, so they cannot disagree. See lib/brandLogo.ts.
            image: BRAND_LOGO_DATA_URI,
            // Styling is decided here, not per call site, for the same reason
            // as `name`: six flows open this sheet and it must look the same
            // from all of them.
            theme: { color: CHECKOUT_THEME_COLOR },
            modal: {
                // A stray back-press otherwise closes the sheet mid-payment
                // with no warning; this asks first.
                confirm_close: true,
            },
            // Android: lets the card-OTP step read the SMS itself.
            send_sms_hash: true,
            ...options,
            prefill: cleanPrefill(options.prefill),
        });
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
