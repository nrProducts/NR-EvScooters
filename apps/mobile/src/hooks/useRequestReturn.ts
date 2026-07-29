import { useState } from 'react';
import { rentalRepository } from '../services';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError } from '../lib/ApiError';
import { notify } from '../lib/confirm';
import { describeReturnDeadline } from '../lib/returnPolicy';
import type { ApiRental, ReturnRequestPayload } from '../types/api';

/**
 * Submits the rider's return request. Mirrors useCancelBooking, minus the
 * confirmAction step — the modal itself already states the deadline, the fee
 * and the policy, so a second confirmation would just be noise.
 */
export function useRequestReturn() {
  const [submitting, setSubmitting] = useState(false);

  /** Resolves true only if the request was actually recorded. */
  const requestReturn = async (rental: ApiRental, payload: ReturnRequestPayload): Promise<boolean> => {
    setSubmitting(true);
    try {
      const updated = await rentalRepository.requestReturn(rental.id, payload);
      // The rental stays active here, so has_active_rental shouldn't change —
      // but every mutation touching rental/booking state refreshes the cached
      // profile, and that invariant is what keeps the app's gating coherent.
      await useAuthStore.getState().refreshProfile();

      // Report the server's deadline, not the locally computed estimate.
      notify(
        'Return Requested',
        `Hand your scooter in by ${describeReturnDeadline(updated.return_due_at)}. We'll confirm once our team receives it.`,
      );
      return true;
    } catch (err) {
      notify('Could not request return', err instanceof ApiError ? err.message : 'Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, requestReturn };
}
