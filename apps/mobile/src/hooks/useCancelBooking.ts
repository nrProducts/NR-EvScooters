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
    const charge = computeCancellationCharge({
      startDay: booking.start_day,
      planPrice: booking.plan?.price ?? null,
      discountAmount: booking.referral_discount_amount,
      createdAt: booking.created_at,
    });

    // Payment collection isn't built yet, so every message has to be explicit
    // that no money has moved — otherwise riders will wait for a transfer.
    const notChargedNote =
      "\n\nNothing has been charged yet — payment collection goes live in a later update, and we'll record this refund request against it.";

    const freeReason = charge.withinGrace
      // Worth saying explicitly — otherwise a rider who booked for tomorrow
      // can't tell why this one is free when the policy text says otherwise.
      ? `You booked this less than ${FREE_CANCELLATION_GRACE_MINUTES} minutes ago, so there's no cancellation fee.`
      : "You're cancelling more than a day before pickup, so there's no cancellation fee.";

    const message = charge.isLate
      ? `Your pickup is ${describePickupTiming(charge.daysUntilPickup)}. Cancelling now applies a ${Math.round(
          LATE_CANCELLATION_PENALTY_RATE * 100,
        )}% late-cancellation fee of ₹${charge.penaltyAmount} on the ₹${charge.chargeableAmount} plan price, leaving a refund of ₹${charge.refundAmount}.${notChargedNote}`
      : `${freeReason} We'll record a refund request for ₹${charge.refundAmount}.${notChargedNote}`;

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

      // Report the server's figures, not the local estimate.
      const fee = cancelled.cancellation_penalty_amount ?? 0;
      notify(
        'Booking Cancelled',
        fee > 0
          ? `A late-cancellation fee of ₹${fee} was applied. Refund request for ₹${cancelled.refund_amount ?? 0} recorded.`
          : `No cancellation fee applied. Refund request for ₹${cancelled.refund_amount ?? 0} recorded.`,
      );
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
