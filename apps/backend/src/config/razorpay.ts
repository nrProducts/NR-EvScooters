import Razorpay from "razorpay";
import { serviceUnavailable } from "../common/AppError";
import { env } from "./env";

let client: Razorpay | null = null;

/**
 * Lazily constructed — never at import time. Keys are allowed to be empty in
 * dev (see env.ts), so the server must still boot with none configured; only
 * a call site that actually needs the gateway sees an error, and it's a
 * clean 503 rather than a crash.
 */
export function getRazorpay(): Razorpay {
    if (!env.razorpayKeyId || !env.razorpayKeySecret) {
        throw serviceUnavailable("Payment gateway is not configured.");
    }
    if (!client) {
        client = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
    }
    return client;
}
