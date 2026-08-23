import Razorpay from "razorpay";
import { badRequest, serviceUnavailable } from "../common/AppError";
import { env } from "./env";

let client: Razorpay | null = null;
/** The key the cached client was built with, so a changed key rebuilds it. */
let clientKeyId: string | null = null;

/**
 * Lazily constructed — never at import time. Keys are allowed to be empty in
 * dev (see env.ts), so the server must still boot with none configured; only
 * a call site that actually needs the gateway sees an error, and it's a
 * clean 503 rather than a crash.
 *
 * In production env.ts refuses to boot without the keys, so this 503 is a
 * development affordance only. It must never again be paired with a fallback
 * that pretends the payment succeeded.
 */
export function getRazorpay(): Razorpay {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
        throw serviceUnavailable("Payment gateway is not configured.");
    }
    // Rebuilt when the key changes rather than cached for the process
    // lifetime. A stale client is the kind of fault that presents as
    // "the gateway says my key expired" while the config on disk looks
    // perfectly correct — worth one string comparison to rule out.
    if (!client || clientKeyId !== env.razorpayKeyId) {
        client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
        clientKeyId = env.razorpayKeyId;
    }
    return client;
}

/**
 * The subset of Razorpay's payment entity this codebase relies on.
 *
 * Declared rather than imported because the SDK's own type widens `status`
 * and `method` to `string`, and the narrowing is exactly what the verify path
 * needs to be checking.
 */
export interface GatewayPayment {
    id: string;
    order_id: string | null;
    /** Paise. */
    amount: number;
    currency: string;
    status: "created" | "authorized" | "captured" | "refunded" | "failed";
    method: string | null;
    captured: boolean;
    error_code: string | null;
    error_description: string | null;
}

/**
 * Asks Razorpay what actually happened to a payment.
 *
 * This is the authority, and the reason it exists is that a valid checkout
 * signature does NOT mean the money arrived. The signature over
 * `order_id|payment_id` proves only that the pair is genuine and belongs to
 * this merchant account — it is computed by Razorpay the moment the payment
 * is created, before capture, and it stays valid for a payment that is
 * subsequently voided or never captured at all. Trusting it alone releases a
 * scooter against funds that may never settle.
 */
export async function fetchGatewayPayment(paymentId: string): Promise<GatewayPayment> {
    const raw = await withGatewayErrors(
        () => getRazorpay().payments.fetch(paymentId),
    ) as unknown as Record<string, unknown>;
    return {
        id: String(raw.id),
        order_id: raw.order_id ? String(raw.order_id) : null,
        amount: Number(raw.amount),
        currency: String(raw.currency),
        status: raw.status as GatewayPayment["status"],
        method: raw.method ? String(raw.method) : null,
        captured: raw.captured === true,
        error_code: raw.error_code ? String(raw.error_code) : null,
        error_description: raw.error_description ? String(raw.error_description) : null,
    };
}

/**
 * Creates the gateway order, with SDK failures mapped to real API errors.
 *
 * This is the call that 401s when the key pair is dead, and it is the first
 * thing a rider touches on checkout — so it is the one that most needs to fail
 * legibly rather than as an unhandled 500.
 */
export async function createGatewayOrder(params: {
    amount: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
}): Promise<{ id: string }> {
    const order = await withGatewayErrors(() => getRazorpay().orders.create(params));
    return { id: String((order as unknown as { id: string }).id) };
}

/**
 * Turns a Razorpay SDK rejection into an AppError the API can return.
 *
 * Without this, a gateway failure propagates as an unrecognised object and
 * `errorHandler` flattens it to a generic 500 "Something went wrong" — which
 * is what a dead API key looked like from the outside:
 *
 *     POST /api/v1/payments/bookings/:id/order 500
 *     [unhandled] { statusCode: 401, error: { description: 'Authentication failed' } }
 *
 * The one thing an operator most needs to know — OUR credentials are
 * rejected — was buried in a log line and invisible to the caller. A
 * misconfiguration must not be indistinguishable from a bug.
 *
 * Razorpay's own error text is surfaced only for 4xx that describe the
 * REQUEST; auth failures deliberately say nothing specific to the rider,
 * because the detail is about our configuration, not their payment.
 */
async function withGatewayErrors<T>(call: () => Promise<T>): Promise<T> {
    try {
        return await call();
    } catch (err) {
        const e = err as {
            statusCode?: number;
            error?: { description?: string; code?: string };
        };
        if (!e?.statusCode) throw err;

        if (e.statusCode === 401 || e.statusCode === 403) {
            console.error("[razorpay] credentials rejected by the gateway", {
                statusCode: e.statusCode,
                code: e.error?.code,
            });
            throw serviceUnavailable(
                "Payments are temporarily unavailable. Please try again shortly.",
            );
        }

        if (e.statusCode >= 500) {
            throw serviceUnavailable("The payment gateway is not responding. Please try again.");
        }

        throw badRequest(e.error?.description ?? "The payment gateway rejected this request.");
    }
}

/**
 * Asks Razorpay, once at boot, whether our credentials actually work.
 *
 * Never throws and never blocks startup: a gateway outage must not stop the
 * server serving everything else. It exists because a dead key is otherwise
 * invisible until a rider is standing in Checkout, and the message they get
 * there ("The api key provided by you has expired") describes OUR
 * misconfiguration in language aimed at them.
 *
 * Only the key ID is logged. It is the public half.
 */
export async function reportGatewayKeyStatus(): Promise<void> {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
        console.warn("[razorpay] no credentials configured — payments will return 503.");
        return;
    }

    const mode = env.razorpayKeyId.startsWith("rzp_live_") ? "LIVE" : "TEST";
    const auth = Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString("base64");

    try {
        const res = await fetch("https://api.razorpay.com/v1/orders?count=1", {
            headers: { Authorization: `Basic ${auth}` },
        });
        if (res.ok) {
            console.log(`[razorpay] ${mode} key ${env.razorpayKeyId} — OK`);
        } else if (res.status === 401 || res.status === 403) {
            console.error(
                `[razorpay] ${mode} key ${env.razorpayKeyId} — REJECTED (${res.status}). ` +
                "Payments WILL fail. The id and secret must come from the same " +
                "generation, and generating a new pair deactivates the previous one. " +
                "Run: pnpm verify:razorpay",
            );
        } else {
            console.warn(`[razorpay] key check returned HTTP ${res.status}; continuing.`);
        }
    } catch (err) {
        console.warn("[razorpay] key check could not reach the gateway; continuing.", err);
    }
}
