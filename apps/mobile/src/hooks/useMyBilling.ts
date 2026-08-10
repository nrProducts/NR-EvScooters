import { useEffect, useState } from 'react';
import { billingRepository, bookingRepository } from '../services';
import { useCurrentRideOrBooking } from './useCurrentRideOrBooking';
import type { ApiBookingWithPlan, ApiDamage, ApiDeposit, ApiInvoice } from '../types/api';

export interface MyBillingState {
    bookingId: string | null;
    /** Carries plan_status/next_due_at — fetched by id so it's present both pre-pickup and mid-rental. */
    booking: ApiBookingWithPlan | null;
    deposit: ApiDeposit | null;
    damages: ApiDamage[];
    invoices: ApiInvoice[];
}

const EMPTY: MyBillingState = { bookingId: null, booking: null, deposit: null, damages: [], invoices: [] };

/**
 * Resolves the rider's current booking id — whether they're still
 * pre-pickup (a booking) or already riding (a rental, which only carries
 * booking_id, not the plan fields) — then loads the booking's own
 * plan/billing state plus deposit/damage/payment history for it.
 * bookingRepository.byId (not mine()/rideState.booking) is what makes this
 * work once the rider has been picked up: mine() only ever returns a
 * pending_payment/confirmed booking, so plan_status/next_due_at would
 * otherwise go blank the moment the booking becomes 'fulfilled' — which is
 * most of a rental's life. All amounts/statuses come straight from the
 * backend; this hook never computes one itself.
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
            bookingRepository.byId(bookingId),
            billingRepository.myDeposit(bookingId),
            billingRepository.myDamages(bookingId),
            billingRepository.myInvoices({ bookingId, pageSize: 50 }),
        ])
            .then(([booking, deposit, damages, invoicesPage]) => {
                setBilling({
                    bookingId,
                    booking: booking as ApiBookingWithPlan,
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
