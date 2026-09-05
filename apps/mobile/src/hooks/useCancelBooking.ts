import { useState } from 'react';
import { bookingRepository } from '../services';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { confirmAction, notify } from '../lib/confirm';
import { computeCancellationCharge, describeElapsed } from '../lib/cancellationPolicy';
import { useT } from '../i18n';
import type { ApiBooking } from '../types/api';

/**
 * Shared by Home and Booking History so the money copy lives in exactly one
 * place. The fee/refund shown in the dialog is a local estimate; the server
 * recomputes authoritatively and the success toast reports ITS numbers, so a
 * rule mismatch surfaces to the rider instead of hiding.
 */
export function useCancelBooking() {
  const { t } = useT();
  const [cancelling, setCancelling] = useState(false);

  /** Resolves true only if the booking was actually cancelled. */
  const cancelBooking = async (booking: ApiBooking): Promise<boolean> => {
    // Only a 'confirmed' booking was actually paid for — nothing to refund
    // (or charge a fee against) for one still awaiting payment.
    const wasPaid = booking.status === 'confirmed';
    const planPaid = wasPaid
      ? Math.max(0, (booking.plan?.price ?? 0) - (booking.referral_discount_amount ?? 0))
      : 0;
    const charge = computeCancellationCharge({
      planPaid,
      depositAmount: wasPaid ? booking.plan?.deposit_amount ?? 0 : 0,
      createdAt: booking.created_at,
    });

    const refundNote = wasPaid && charge.refundAmount > 0
      ? t('cancelBooking.refundNote')
      : '';

    const elapsed = describeElapsed(charge.elapsedMinutes, t);
    const message = !wasPaid
      ? t('cancelBooking.notPaidYet')
      : charge.penaltyAmount > 0
        ? t('cancelBooking.withPenalty', {
            elapsed,
            percent: charge.penaltyPercent,
            penalty: charge.penaltyAmount,
            planPaid: charge.planPaid,
            refund: charge.refundAmount,
            depositNote: charge.depositRefund > 0
              ? t('cancelBooking.depositNote', { amount: charge.depositRefund })
              : '',
            refundNote,
          })
        : t('cancelBooking.noPenalty', { elapsed, refund: charge.refundAmount, refundNote });

    const confirmed = await confirmAction({
      title: t('cancelBooking.confirm.title'),
      message,
      confirmLabel: t('cancelBooking.confirm.confirmLabel'),
      cancelLabel: t('cancelBooking.confirm.cancelLabel'),
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
      const feeNote = fee > 0 ? t('cancelBooking.feeApplied', { amount: fee }) : '';
      const refundNote = refundAmount <= 0
        ? t('cancelBooking.noRefundOwed')
        : cancelled.refund_status === 'processed'
          ? t('cancelBooking.refundComplete', { amount: refundAmount })
          : t('cancelBooking.refundRequested', { amount: refundAmount });
      notify(t('cancelBooking.cancelled.title'), `${feeNote}${refundNote}`);
      return true;
    } catch (err) {
      notify(t('cancelBooking.error.title'), err instanceof ApiError ? err.message : t('common.pleaseTryAgain'));
      return false;
    } finally {
      setCancelling(false);
    }
  };

  return { cancelling, cancelBooking };
}
