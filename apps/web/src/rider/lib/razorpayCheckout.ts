/**
 * Web Razorpay Checkout — the browser counterpart of
 * apps/mobile/src/lib/razorpayCheckout.ts (which uses react-native-razorpay).
 *
 * Same contract: given a server-created ApiPaymentOrder, open Checkout and
 * resolve with the { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * triple that POST /payments/verify expects. Never trust this result alone —
 * the caller MUST call verifyPayment() and only advance the UI on a 2xx.
 */
import type { ApiPaymentOrder, VerifyPaymentPayload } from "../types/api";

export class PaymentCancelledError extends Error {
  constructor() {
    super("Payment was cancelled.");
    this.name = "PaymentCancelledError";
  }
}

export class PaymentUnavailableError extends Error {
  constructor() {
    super("Payments are temporarily unavailable. Please try again in a moment.");
    this.name = "PaymentUnavailableError";
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const PRIMARY_COLOR = "#21C45D";

let scriptPromise: Promise<void> | null = null;

function loadCheckoutScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    if (typeof window !== "undefined" && (window as unknown as { Razorpay?: unknown }).Razorpay) {
      resolve();
      return;
    }
    const el = document.createElement("script");
    el.src = CHECKOUT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptPromise = null;
      reject(new PaymentUnavailableError());
    };
    document.body.appendChild(el);
  });
  return scriptPromise;
}

interface CheckoutOptions {
  order: ApiPaymentOrder;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
}

export async function openRazorpayCheckout({
  order,
  description,
  prefill,
}: CheckoutOptions): Promise<VerifyPaymentPayload> {
  await loadCheckoutScript();
  const Razorpay = (window as unknown as { Razorpay?: new (o: unknown) => { open(): void } }).Razorpay;
  if (!Razorpay) throw new PaymentUnavailableError();

  return new Promise<VerifyPaymentPayload>((resolve, reject) => {
    let settled = false;
    const rzp = new Razorpay({
      key: order.keyId,
      amount: Math.round(order.amount * 100), // paise
      currency: order.currency || "INR",
      order_id: order.gatewayOrderId,
      name: "SwapNgo",
      description,
      prefill: {
        name: prefill?.name ?? "",
        email: prefill?.email ?? "",
        contact: prefill?.contact ?? "",
      },
      theme: { color: PRIMARY_COLOR },
      handler: (res: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        settled = true;
        resolve({
          razorpay_order_id: res.razorpay_order_id,
          razorpay_payment_id: res.razorpay_payment_id,
          razorpay_signature: res.razorpay_signature,
        });
      },
      modal: {
        ondismiss: () => {
          if (!settled) reject(new PaymentCancelledError());
        },
      },
    });
    rzp.open();
  });
}
