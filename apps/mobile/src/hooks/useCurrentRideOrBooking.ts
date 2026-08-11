import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { rentalRepository, bookingRepository } from '../services';
import type { ApiBooking, ApiRental } from '../types/api';

export type CurrentRideOrBooking =
  | { kind: 'rental'; rental: ApiRental }
  | { kind: 'booking'; booking: ApiBooking }
  | { kind: 'none' };

/**
 * Before pickup a rider's scooter/plan only exists on their booking
 * (bookings.vehicle_id, status 'booked'); rentalRepository.mine() returns
 * nothing until staff confirm pickup and a rentals row is created. My
 * Plan/My Scooter need to fall back to the booking in that window instead
 * of showing an empty state.
 */
export function useCurrentRideOrBooking() {
  const profile = useAuthStore((s) => s.profile);
  const [state, setState] = useState<CurrentRideOrBooking>({ kind: 'none' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * Returns the in-flight request so callers (pull-to-refresh) can await the
   * real settle instead of resolving on the next tick.
   *
   * `background` suppresses the `loading` flip. Screens swap their whole body
   * for a full-screen loader when `loading` is true, which during a pull would
   * unmount the RefreshControl mid-gesture and strand its spinner.
   */
  const load = (background = false): Promise<void> => {
    if (!profile) {
      setState({ kind: 'none' });
      setLoading(false);
      return Promise.resolve();
    }

    if (!background) setLoading(true);
    setError(null);

    if (profile.has_active_rental) {
      return rentalRepository
        .mine()
        .then((rental) => setState(rental ? { kind: 'rental', rental } : { kind: 'none' }))
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your ride.'))
        .finally(() => setLoading(false));
    }

    if (profile.has_active_booking) {
      return bookingRepository
        .mine()
        .then((booking) => setState(booking ? { kind: 'booking', booking } : { kind: 'none' }))
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your booking.'))
        .finally(() => setLoading(false));
    }

    setState({ kind: 'none' });
    setLoading(false);
    return Promise.resolve();
  };

  // Must not pass `load` directly: it now returns a Promise, and React would
  // take that as the effect's cleanup function and blow up on unmount.
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.has_active_rental, profile?.has_active_booking]);

  return { state, loading, error, reload: load };
}
