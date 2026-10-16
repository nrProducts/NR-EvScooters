import { create } from 'zustand';

/**
 * - processing: from the Pay tap until the gateway reports back — creating the
 *   order, then the Razorpay sheet / UPI app.
 * - confirming: the gateway says paid; the backend is verifying the capture.
 *   Money has left the rider's account, so this is the moment leaving the
 *   screen does the most harm.
 */
export type PaymentPhase = 'processing' | 'confirming';

interface PaymentProgressState {
  phase: PaymentPhase | null;
}

/**
 * Which payment step is in flight, app-wide. Every payment flow (booking,
 * billing, late fee, settlement) reports here, and PaymentProgressOverlay is
 * the one place that turns it into a "don't close the app" cover — so no flow
 * draws its own.
 */
export const usePaymentProgressStore = create<PaymentProgressState>(() => ({
  phase: null,
}));

export const setPaymentPhase = (phase: PaymentPhase | null) =>
  usePaymentProgressStore.setState({ phase });
