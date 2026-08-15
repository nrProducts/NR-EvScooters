import { useState } from 'react';
import { bookingRepository } from '../services';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { confirmAction, notify } from '../lib/confirm';
import {
  FREE_CANCELLATION_GRACE_MINUTES, LATE_CANCELLATION_PENALTY_RATE,
  computeCancellationCharge, describePickupTiming,
} from '../lib/cancellationPolicy';
import type { ApiBooking } from '../types/api';

/**
 * Shared by Home and Booking History so the money copy lives in exactly one
 * place. The fee/refund shown in the dialog is a local estimate; the server
 * recomputes authoritatively and the success toast reports ITS numbers, so a
 * rule mismatch surfaces to the rider instead of hiding.
 */
export function useCancelBooking() {
  const [cancelling, setCancelling] = useState(false);

  /** Resolves true only if the booking was actually cancelled. */
  const cancelBooking = async (booking: ApiBooking): Promise<boolean> => {
    // Only a 'confirmed' booking was actually paid for — nothing to refund
    // (or charge a fee against) for one still awaiting payment.
    const wasPaid = booking.status === 'confirmed';
    const charge = computeCancellationCharge({
      startDay: booking.start_day,
      planPrice: booking.plan?.price ?? null,
      discountAmount: booking.referral_discount_amount,
      depositAmount: wasPaid ? booking.plan?.deposit_amount ?? 0 : 0,
      createdAt: booking.created_at,
    });

    const refundNote = wasPaid && charge.refundAmount > 0
      ? "\n\nWe'll send this back to your original payment method after a quick review, generally the same day."
      : '';

    const freeReason = charge.withinGrace
      // Worth saying explicitly — otherwise a rider who booked for tomorrow
      // can't tell why this one is free when the policy text says otherwise.
      ? `You booked this less than ${FREE_CANCELLATION_GRACE_MINUTES} minutes ago, so there's no cancellation fee.`
      : "You're cancelling more than a day before pickup, so there's no cancellation fee.";

    const message = !wasPaid
      ? "This booking hasn't been paid for yet, so there's nothing to charge or refund."
      : charge.isLate
        ? `Your pickup is ${describePickupTiming(charge.daysUntilPickup)}. Cancelling now applies a ${Math.round(
            LATE_CANCELLATION_PENALTY_RATE * 100,
          )}% late-cancellation fee of ₹${charge.penaltyAmount} on the ₹${charge.chargeableAmount} plan price, leaving a refund of ₹${charge.refundAmount}.${refundNote}`
        : `${freeReason} You'll be refunded ₹${charge.refundAmount}.${refundNote}`;

    const confirmed = await confirmAction({
      title: 'Cancel Booking?',
      message,
      confirmLabel: 'Cancel Booking',
      cancelLabel: 'Keep Booking',
      destructive: true,
    });
    if (!confirmed) return false;

    setCancelling(true);
    try {
      const cancelled = await bookingRepository.cancel(booking.id);
      // Non-negotiable: has_active_booking is cached on the profile and gates
      // Home, useCurrentRideOrBooking, My Plan, My Scooter and the drawer nav.
      // Without this they all keep showing a booking that no longer exists.
      await useAuthStore.getState().refreshProfile();

      // Report the server's figures, not the local estimate. A cancellation
      // refund is never auto-processed — refund_status stays 'pending' until
      // staff approve it, so the copy here must not claim it's already moving.
      const fee = cancelled.cancellation_penalty_amount ?? 0;
      const refundAmount = cancelled.refund_amount ?? 0;
      const feeNote = fee > 0 ? `A late-cancellation fee of ₹${fee} was applied. ` : '';
      const refundNote = refundAmount <= 0
        ? 'No refund is owed.'
        : cancelled.refund_status === 'processed'
          ? `Your refund of ₹${refundAmount} is complete.`
          : `Your refund of ₹${refundAmount} has been requested — we'll notify you once it's approved and sent.`;
      notify('Booking Cancelled', `${feeNote}${refundNote}`);
      return true;
    } catch (err) {
      notify('Could not cancel', err instanceof ApiError ? err.message : 'Please try again.');
      return false;
    } finally {
      setCancelling(false);
    }
  };

  return { cancelling, cancelBooking };
}
