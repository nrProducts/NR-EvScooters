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
 * The rider left for their UPI app and never came back with a result.
 *
 * UPI intent fires an app switch and then has nothing to report until the app
 * returns — no event arrives if the rider abandons it or kills the app. The
 * spinner must not sit there forever (it did, and that is what this flow was
 * rewritten to fix), so the wait is capped and ends here.
 */
export class PaymentTimedOutError extends Error {
    constructor() {
        super('Payment timed out.');
        this.name = 'PaymentTimedOutError';
    }
}

/**
 * The one-tap UPI intent path could not be STARTED — Custom Checkout is not
 * enabled on the account, its script was blocked, or it rejected the payload
 * before any payment existed. Internal: it means "fall back to the hosted
 * sheet", never "the payment failed", so it is not exported.
 */
class UpiIntentUnavailableError extends Error {
    constructor() {
        super('UPI intent checkout unavailable.');
        this.name = 'UpiIntentUnavailableError';
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

/**
 * Custom Checkout (razorpay.js). It renders nothing — the app owns the UI and
 * this only moves the money, which is the whole reason it can fire a UPI
 * intent straight from the slide gesture with no sheet of its own in between.
 */
interface RazorpayCustomInstance {
    createPayment(data: Record<string, unknown>, options?: { app?: string }): void;
    on(event: 'payment.success', handler: (response: RazorpayWebSuccessPayload) => void): void;
    on(event: 'payment.error', handler: (response: RazorpayWebFailurePayload) => void): void;
    emit(event: 'payment.cancel'): void;
}

type StandardCheckoutCtor = new (options: RazorpayWebOptions) => RazorpayWebInstance;
type CustomCheckoutCtor = new (options: { key: string }) => RazorpayCustomInstance;

declare global {
    interface Window {
        Razorpay?: StandardCheckoutCtor | CustomCheckoutCtor;
    }
}

const CHECKOUT_JS_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const RAZORPAY_JS_SRC = 'https://checkout.razorpay.com/v1/razorpay.js';

/**
 * BOTH scripts define `window.Razorpay`, and they are different constructors —
 * the hosted sheet's (`.open()`) and Custom Checkout's (`.createPayment()`).
 * A session that loads one and then falls back to the other would otherwise
 * find the wrong one under that global, so each constructor is captured the
 * instant ITS script loads and nothing afterwards ever reads the global.
 */
let standardCtor: StandardCheckoutCtor | null = null;
let customCtor: CustomCheckoutCtor | null = null;
const scriptLoads = new Map<string, Promise<void>>();

function loadRazorpayScript(src: string, capture: () => void): Promise<void> {
    const pending = scriptLoads.get(src);
    if (pending) return pending;

    const load = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => {
            capture();
            resolve();
        };
        // A blocked/failed load (offline, an ad-blocker) must read as
        // "unavailable", not hang the slider's spinner forever.
        script.onerror = () => {
            script.remove();
            reject(new PaymentUnavailableError());
        };
        document.head.appendChild(script);
    }).catch((err) => {
        // A failed load must not be cached — the next attempt (network back,
        // blocker disabled) should try again, not replay the same rejection.
        scriptLoads.delete(src);
        throw err;
    });

    scriptLoads.set(src, load);
    return load;
}

async function loadStandardCheckout(): Promise<StandardCheckoutCtor> {
    if (!standardCtor) {
        await loadRazorpayScript(CHECKOUT_JS_SRC, () => {
            standardCtor = window.Razorpay as StandardCheckoutCtor | undefined ?? null;
        });
    }
    if (!standardCtor) throw new PaymentUnavailableError();
    return standardCtor;
}

async function loadCustomCheckout(): Promise<CustomCheckoutCtor> {
    if (!customCtor) {
        await loadRazorpayScript(RAZORPAY_JS_SRC, () => {
            customCtor = window.Razorpay as CustomCheckoutCtor | undefined ?? null;
        });
    }
    if (!customCtor) throw new UpiIntentUnavailableError();
    return customCtor;
}

async function openRazorpayCheckoutWeb(merged: RazorpayCheckoutOptions): Promise<VerifyPaymentPayload> {
    const Razorpay = await loadStandardCheckout();

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

// ---------------------------------------------------------------------------
// One-tap UPI intent (Custom Checkout, Android mobile web only)
// ---------------------------------------------------------------------------

/**
 * Capped wait for the UPI app to come back. Nothing is charged by giving up —
 * this only stops waiting; if the rider does pay after this, the backend's
 * own webhook still settles the order.
 */
const UPI_INTENT_TIMEOUT_MS = 5 * 60_000;

/**
 * UPI intent needs a real UPI app to hand off to, which rules out desktop
 * (Razorpay falls back to a QR there, a surface this app does not render) and
 * iOS, where the `any`-app chooser is not supported.
 */
function canUseUpiIntent(): boolean {
    return (
        Platform.OS === 'web'
        && typeof navigator !== 'undefined'
        && /android/i.test(navigator.userAgent ?? '')
    );
}

/**
 * Fires a UPI intent directly, with no Razorpay sheet in between: the slide
 * gesture IS the confirmation, and the next thing the rider sees is Android's
 * own UPI app chooser (GPay/PhonePe/Paytm).
 *
 * `app: 'any'` is deliberate — letting Android present the chooser keeps the
 * payment-app choice out of this app entirely, the same division of labour
 * the hosted sheet had.
 */
async function openUpiIntentCheckout(merged: RazorpayCheckoutOptions): Promise<VerifyPaymentPayload> {
    const contact = merged.prefill?.contact;
    const email = merged.prefill?.email;
    // Custom Checkout validates these itself and rejects the payload rather
    // than prompting for them the way the hosted sheet would, so a rider
    // missing either (Google sign-ups carry no phone) takes the sheet instead.
    if (!contact || !email) throw new UpiIntentUnavailableError();

    const Razorpay = await loadCustomCheckout();

    return new Promise<VerifyPaymentPayload>((resolve, reject) => {
        let settled = false;
        const razorpay = new Razorpay({ key: merged.key });

        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            razorpay.emit('payment.cancel');
            reject(new PaymentTimedOutError());
        }, UPI_INTENT_TIMEOUT_MS);

        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            fn();
        };

        razorpay.on('payment.success', (response) => {
            finish(() =>
                resolve({
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                }),
            );
        });

        razorpay.on('payment.error', (response) => {
            // A payment was attempted and failed — a real outcome the rider
            // must see, never a reason to reopen a second sheet behind it.
            finish(() => reject(new Error(response.error?.description ?? 'Payment failed. Please try again.')));
        });

        try {
            razorpay.createPayment(
                {
                    amount: merged.amount,
                    currency: merged.currency,
                    order_id: merged.order_id,
                    method: 'upi',
                    contact,
                    email,
                    ...(merged.notes ? { notes: merged.notes } : {}),
                },
                { app: 'any' },
            );
        } catch {
            finish(() => reject(new UpiIntentUnavailableError()));
        }
    });
}

/**
 * The booking flow's entry point: one slide, one payment.
 *
 * Tries the no-sheet UPI intent first and falls back to the hosted sheet when
 * that path cannot START — Custom Checkout not enabled on the account, script
 * blocked, payload refused, or simply not Android web. A cancel, a timeout or
 * a failed payment are the rider's own outcomes and propagate as-is: opening
 * a second sheet on top of those is exactly the extra tap this replaces.
 */
export async function openCheckoutPreferUpiIntent(
    options: RazorpayCheckoutOptions,
): Promise<VerifyPaymentPayload> {
    if (canUseUpiIntent()) {
        try {
            return await openUpiIntentCheckout({ ...options, prefill: cleanPrefill(options.prefill) });
        } catch (err) {
            if (!(err instanceof UpiIntentUnavailableError)) throw err;
        }
    }
    return openRazorpayCheckout(options);
}
