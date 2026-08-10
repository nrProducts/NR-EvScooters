import { useEffect, useState } from 'react';
import { billingRepository } from '../services';
import { useCurrentRideOrBooking } from './useCurrentRideOrBooking';
import type { ApiBookingWithPlan, ApiDamage, ApiDeposit, ApiInvoice } from '../types/api';

export interface MyBillingState {
    bookingId: string | null;
    /** Present only when the rider's current state is a booking (pre-pickup) — carries plan_status/next_due_at. */
    booking: ApiBookingWithPlan | null;
    deposit: ApiDeposit | null;
    damages: ApiDamage[];
    invoices: ApiInvoice[];
}

const EMPTY: MyBillingState = { bookingId: null, booking: null, deposit: null, damages: [], invoices: [] };

/**
 * Resolves the rider's current booking id — whether they're still
 * pre-pickup (a booking) or already riding (a rental, which only carries
 * booking_id, not the plan fields) — then loads deposit/damage/payment
 * history for it. All amounts/statuses come straight from the backend; this
 * hook never computes one itself.
 */
export function useMyBilling() {
    const { state: rideState, loading: rideLoading, error: rideError, reload: reloadRide } = useCurrentRideOrBooking();
    const [billing, setBilling] = useState<MyBillingState>(EMPTY);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const bookingId = rideState.kind === 'booking'
        ? rideState.booking.id
        : rideState.kind === 'rental'
            ? rideState.rental.booking_id
            : null;

    const load = () => {
        if (rideLoading) return;
        if (!bookingId) {
            setBilling(EMPTY);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        Promise.all([
            billingRepository.myDeposit(bookingId),
            billingRepository.myDamages(bookingId),
            billingRepository.myInvoices({ bookingId, pageSize: 50 }),
        ])
            .then(([deposit, damages, invoicesPage]) => {
                setBilling({
                    bookingId,
                    booking: rideState.kind === 'booking' ? (rideState.booking as ApiBookingWithPlan) : null,
                    deposit,
                    damages,
                    invoices: invoicesPage.data,
                });
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your billing details.'))
            .finally(() => setLoading(false));
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(load, [rideLoading, bookingId]);

    return {
        ...billing,
        loading: rideLoading || loading,
        error: rideError ?? error,
        reload: () => {
            reloadRide();
            load();
        },
    };
}
