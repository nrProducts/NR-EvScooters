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

// ---------------------------------------------------------------------------
// Web: Razorpay has no native module there, so this loads their own hosted
// Checkout.js and drives its widget instead. Same order, same key, same
// verify step on the backend afterwards — only how the sheet itself opens
// differs.
// ---------------------------------------------------------------------------

interface RazorpayWebSuccessPayload {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

interface RazorpayWebFailurePayload {
    error?: { code?: string; description?: string; reason?: string };
}

interface RazorpayWebOptions extends Omit<RazorpayCheckoutOptions, 'send_sms_hash'> {
    handler: (response: RazorpayWebSuccessPayload) => void;
    modal?: RazorpayCheckoutOptions['modal'] & { ondismiss?: () => void };
}

interface RazorpayWebInstance {
    open(): void;
    on(event: 'payment.failed', handler: (response: RazorpayWebFailurePayload) => void): void;
}

declare global {
    interface Window {
        Razorpay?: new (options: RazorpayWebOptions) => RazorpayWebInstance;
    }
}

const CHECKOUT_JS_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

/**
 * Injects Razorpay's Checkout.js once and memoizes the load — every payment
 * flow calls openRazorpayCheckout independently, and re-fetching/re-running
 * the script on a second payment attempt in the same session would be pure
 * waste (and Razorpay does not document it as safe to run twice).
 */
let checkoutScriptPromise: Promise<void> | null = null;
function loadCheckoutScript(): Promise<void> {
    if (window.Razorpay) return Promise.resolve();
    if (checkoutScriptPromise) return checkoutScriptPromise;

    checkoutScriptPromise = new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_JS_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new PaymentUnavailableError()));
            return;
        }
        const script = document.createElement('script');
        script.src = CHECKOUT_JS_SRC;
        script.async = true;
        script.onload = () => resolve();
        // A blocked/failed script load (offline, an ad-blocker) must read as
        // "payment unavailable," not hang the Pay button's spinner forever.
        // The tag is removed too: `load`/`error` each fire at most once per
        // element, so a retry that found this dead tag via the `existing`
        // branch above would attach listeners that can now never fire —
        // removing it means the retry creates a fresh element instead.
        script.onerror = () => {
            script.remove();
            reject(new PaymentUnavailableError());
        };
        document.head.appendChild(script);
    }).catch((err) => {
        // A failed load must not be cached — the next attempt (network back,
        // blocker disabled) should try again, not replay the same rejection.
        checkoutScriptPromise = null;
        throw err;
    });
    return checkoutScriptPromise;
}

async function openRazorpayCheckoutWeb(merged: RazorpayCheckoutOptions): Promise<VerifyPaymentPayload> {
    await loadCheckoutScript();
    if (!window.Razorpay) throw new PaymentUnavailableError();
    const Razorpay = window.Razorpay;

    return new Promise<VerifyPaymentPayload>((resolve, reject) => {
        // Checkout.js fires `payment.failed` but leaves its own sheet open so
        // the rider can retry the card/UPI attempt — `ondismiss` then ALSO
        // fires once they actually close it. This flag makes sure only the
        // FIRST of those two settles the promise; the second is a no-op
        // reject() on an already-settled promise otherwise, which is
        // harmless, but tracking it explicitly keeps the intent readable.
        let settled = false;

        const rzp = new Razorpay({
            key: merged.key,
            amount: merged.amount,
            currency: merged.currency,
            order_id: merged.order_id,
            name: merged.name,
            description: merged.description,
            image: merged.image,
            prefill: merged.prefill,
            notes: merged.notes,
            theme: merged.theme,
            config: merged.config,
            handler: (response) => {
                settled = true;
                resolve({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                });
            },
            modal: {
                confirm_close: merged.modal?.confirm_close,
                ondismiss: () => {
                    if (!settled) {
                        settled = true;
                        reject(new PaymentCancelledError());
                    }
                },
            },
        });

        rzp.on('payment.failed', (response) => {
            if (settled) return;
            settled = true;
            reject(new Error(response.error?.description ?? 'Payment failed. Please try again.'));
        });

        rzp.open();
    });
}

/**
 * Opens Razorpay Checkout — the native sheet on iOS/Android, Checkout.js's
 * widget on web — and returns the verify-callback payload on success. Never
 * resolves with a "failed" state — a decline, cancel, or the checkout
 * surface being unavailable (native module not linked, or Checkout.js
 * failing to load) all reject, so callers only need a single try/catch.
 */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<VerifyPaymentPayload> {
    // Applied here rather than at each of the six call sites, so the
    // ordering can never drift between the booking, resumed-booking,
    // invoice, recharge, overdue-late-fee and settlement flows. A caller may
    // still override any of these.
    const merged: RazorpayCheckoutOptions = {
        // Brand name and method ordering are defaults, not per-call
        // decisions — `name` was previously repeated verbatim at every call
        // site, which is how a rename ends up half-applied.
        name: 'Swapngo',
        // Replaces Razorpay's generated letter placeholder (the bare "S").
        // The dashboard's Checkout Styling logo should ALSO be set — it
        // covers Payment Links and receipts, which this does not — but it
        // needs an activated account, and this works today. Same artwork
        // either way, so they cannot disagree. See lib/brandLogo.ts.
        image: BRAND_LOGO_DATA_URI,
        // Styling is decided here, not per call site, for the same reason as
        // `name`: six flows open this sheet and it must look the same from
        // all of them.
        theme: { color: CHECKOUT_THEME_COLOR },
        modal: {
            // A stray back-press (native) or an accidental click outside the
            // sheet (web) otherwise closes it mid-payment with no warning;
            // this asks first. Checkout.js honours the same option name.
            confirm_close: true,
        },
        // Android only — lets the card-OTP step read the SMS itself. Web has
        // no SMS to read; Checkout.js ignores an unrecognised option, but
        // omitting it here says so rather than relying on that.
        ...(Platform.OS !== 'web' ? { send_sms_hash: true } : {}),
        ...options,
        prefill: cleanPrefill(options.prefill),
    };

    if (Platform.OS === 'web') {
        return openRazorpayCheckoutWeb(merged);
    }

    let result: RazorpaySuccessResponse;
    try {
        result = await RazorpayCheckout.open(merged);
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
