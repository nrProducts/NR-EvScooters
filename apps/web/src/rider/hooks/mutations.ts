import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRiderAuthStore } from "@/store/riderAuthStore";
import { ApiError } from "@/services/api/httpClient";
import { riderApi } from "../services/riderApi";
import { payOrder } from "../lib/pay";
import { PaymentCancelledError, PaymentUnavailableError } from "../lib/razorpayCheckout";
import { computeCancellationCharge, describeElapsed } from "../lib/cancellationPolicy";
import { describeReturnDeadline } from "../lib/returnPolicy";
import type { ApiBooking, ApiReturnSettlement, ReturnRequestPayload } from "../types/api";

function messageFor(err: unknown, fallback: string): string {
  if (err instanceof PaymentCancelledError || err instanceof PaymentUnavailableError) return err.message;
  if (err instanceof ApiError) return err.message;
  return fallback;
}

/** Refetch everything a payment could have changed. */
function useAfterPayment() {
  const qc = useQueryClient();
  return async () => {
    await useRiderAuthStore.getState().refreshProfile();
    await qc.invalidateQueries({ queryKey: ["rider"] });
  };
}

export function usePayInvoice() {
  const profile = useRiderAuthStore((s) => s.profile);
  const after = useAfterPayment();
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pay = async (invoiceId: string, description: string) => {
    setError(null);
    setPayingId(invoiceId);
    try {
      const order = await riderApi.createPaymentOrderForInvoice(invoiceId);
      await payOrder(order, profile, description);
      await after();
      return true;
    } catch (err) {
      setError(messageFor(err, "Payment failed. Please try again."));
      return false;
    } finally {
      setPayingId(null);
    }
  };

  return { pay, payingId, error };
}

export function usePayBooking() {
  const profile = useRiderAuthStore((s) => s.profile);
  const after = useAfterPayment();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async (bookingId: string, description: string) => {
    setError(null);
    setPaying(true);
    try {
      const order = await riderApi.createPaymentOrderForBooking(bookingId);
      await payOrder(order, profile, description);
      await after();
      return true;
    } catch (err) {
      setError(messageFor(err, "Payment failed. Please try again."));
      return false;
    } finally {
      setPaying(false);
    }
  };

  return { pay, paying, error };
}

export function usePaySettlement(settlement: ApiReturnSettlement | null) {
  const { pay: payInvoice, payingId, error } = usePayInvoice();
  const pay = async () => {
    if (!settlement?.due_invoice_id) return false;
    return payInvoice(settlement.due_invoice_id, "Return Settlement");
  };
  return { pay, paying: !!payingId, error };
}

export function usePayOverdueLateFee() {
  const profile = useRiderAuthStore((s) => s.profile);
  const after = useAfterPayment();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setError(null);
    setPaying(true);
    try {
      const invoice = await riderApi.payMyOverdueLateFee();
      if (!invoice.isPaid) {
        const order = await riderApi.createPaymentOrderForInvoice(invoice.invoiceId);
        await payOrder(order, profile, "Overdue Plan — Late Fee");
      }
      await after();
      return true;
    } catch (err) {
      setError(messageFor(err, "Your late fee payment was not completed. Please try again."));
      return false;
    } finally {
      setPaying(false);
    }
  };

  return { pay, paying, error };
}

export function useCancelBooking() {
  const after = useAfterPayment();
  const [cancelling, setCancelling] = useState(false);

  /** Returns a confirmation string to show the rider, or null if nothing to warn about. */
  const previewMessage = (booking: ApiBooking): string => {
    const wasPaid = booking.status === "confirmed";
    const planPaid = wasPaid
      ? Math.max(0, (booking.plan?.price ?? 0) - (booking.referral_discount_amount ?? 0))
      : 0;
    const charge = computeCancellationCharge({
      planPaid,
      depositAmount: wasPaid ? booking.plan?.deposit_amount ?? 0 : 0,
      createdAt: booking.created_at,
    });
    if (!wasPaid) return "This booking hasn't been paid for yet, so there's nothing to charge or refund.";
    if (charge.penaltyAmount > 0) {
      return `You booked this ${describeElapsed(charge.elapsedMinutes)}. Cancelling now keeps back ${charge.penaltyPercent}% (₹${charge.penaltyAmount}) of the ₹${charge.planPaid} plan amount, leaving a refund of ₹${charge.refundAmount}${charge.depositRefund > 0 ? ` (includes your ₹${charge.depositRefund} deposit)` : ""}. We'll send it back after a quick review.`;
    }
    return `You booked this ${describeElapsed(charge.elapsedMinutes)}, so there's no cancellation fee. You'll be refunded ₹${charge.refundAmount}.`;
  };

  const cancel = async (booking: ApiBooking): Promise<{ ok: boolean; message: string }> => {
    setCancelling(true);
    try {
      const cancelled = await riderApi.cancelBooking(booking.id);
      await after();
      const fee = cancelled.cancellation_penalty_amount ?? 0;
      const refund = cancelled.refund_amount ?? 0;
      const feeNote = fee > 0 ? `A late-cancellation fee of ₹${fee} was applied. ` : "";
      const refundNote =
        refund <= 0
          ? "No refund is owed."
          : cancelled.refund_status === "processed"
            ? `Your refund of ₹${refund} is complete.`
            : `Your refund of ₹${refund} has been requested — we'll notify you once it's approved and sent.`;
      return { ok: true, message: `${feeNote}${refundNote}` };
    } catch (err) {
      return { ok: false, message: messageFor(err, "Could not cancel. Please try again.") };
    } finally {
      setCancelling(false);
    }
  };

  return { cancel, cancelling, previewMessage };
}

export function useRequestReturn() {
  const after = useAfterPayment();
  const [submitting, setSubmitting] = useState(false);

  const requestReturn = async (
    rentalId: string,
    payload: ReturnRequestPayload,
  ): Promise<{ ok: boolean; message: string }> => {
    setSubmitting(true);
    try {
      const updated = await riderApi.requestRentalReturn(rentalId, payload);
      await after();
      return {
        ok: true,
        message: `Hand your scooter in by ${describeReturnDeadline(updated.return_due_at)}. We'll confirm once our team receives it.`,
      };
    } catch (err) {
      return { ok: false, message: messageFor(err, "Could not request return. Please try again.") };
    } finally {
      setSubmitting(false);
    }
  };

  return { requestReturn, submitting };
}
