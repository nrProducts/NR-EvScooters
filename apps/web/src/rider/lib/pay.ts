/**
 * The one payment sequence every rider flow uses, ported from the mobile app:
 *   createOrder*()  ->  openRazorpayCheckout(order)  ->  verifyPayment(payload)
 * The server computes the amount and re-checks with Razorpay; a non-2xx verify
 * means the payment is NOT confirmed and the caller must not advance.
 */
import { riderApi } from "../services/riderApi";
import { openRazorpayCheckout } from "./razorpayCheckout";
import type { ApiMe, ApiPaymentOrder } from "../types/api";

export async function payOrder(
  order: ApiPaymentOrder,
  profile: ApiMe | null,
  description: string,
): Promise<void> {
  const payload = await openRazorpayCheckout({
    order,
    description,
    prefill: {
      name: profile?.full_name,
      email: profile?.email ?? undefined,
      contact: profile?.phone ?? undefined,
    },
  });
  await riderApi.verifyPayment(payload);
}
