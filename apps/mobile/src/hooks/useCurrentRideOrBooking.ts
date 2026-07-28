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

  const load = () => {
    if (!profile) {
      setState({ kind: 'none' });
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (profile.has_active_rental) {
      void rentalRepository
        .mine()
        .then((rental) => setState(rental ? { kind: 'rental', rental } : { kind: 'none' }))
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your ride.'))
        .finally(() => setLoading(false));
      return;
    }

    if (profile.has_active_booking) {
      void bookingRepository
        .mine()
        .then((booking) => setState(booking ? { kind: 'booking', booking } : { kind: 'none' }))
        .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your booking.'))
        .finally(() => setLoading(false));
      return;
    }

    setState({ kind: 'none' });
    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [profile?.has_active_rental, profile?.has_active_booking]);

  return { state, loading, error, reload: load };
}
