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

    const load = (background = false): Promise<void> => {
        if (rideLoading) return Promise.resolve();

        if (!background) setLoading(true);
        setError(null);

        // booking/deposit/damages are genuinely tied to a specific booking —
        // null/empty when there isn't one right now. Invoices are not: Payment
        // History is meant to be a persistent record of every invoice this
        // rider has EVER had, across every past booking, so it's always
        // fetched unscoped rather than emptying out the moment there's no
        // current bookingId (which is what made the whole screen — not just
        // this one section — go blank between plans).
        return Promise.all([
            bookingId ? bookingRepository.byId(bookingId) : Promise.resolve(null),
            bookingId ? billingRepository.myDeposit(bookingId) : Promise.resolve(null),
            bookingId ? billingRepository.myDamages(bookingId) : Promise.resolve([]),
            billingRepository.myInvoices({ pageSize: 50 }),
        ])
            .then(([booking, deposit, damages, invoicesPage]) => {
                setBilling({
                    bookingId,
                    booking: booking as ApiBookingWithPlan | null,
                    deposit,
                    damages,
                    invoices: invoicesPage.data,
                });
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your billing details.'))
            .finally(() => setLoading(false));
    };

    // Not `useEffect(load, ...)`: load returns a Promise now, which React would
    // mistake for the effect's cleanup function.
    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rideLoading, bookingId]);

    return {
        ...billing,
        loading: rideLoading || loading,
        error: rideError ?? error,
        /**
         * Both halves are refetched. They run concurrently rather than
         * sequentially because `load` keys off the bookingId already in state —
         * chaining it after reloadRide would still read the pre-reload id, so
         * waiting buys nothing. If the ride reload does change the booking, the
         * effect above re-fires `load` against the new id.
         */
        reload: (background = false): Promise<void> =>
            Promise.all([reloadRide(background), load(background)]).then(() => undefined),
    };
}
