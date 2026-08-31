import { create } from 'zustand';
import { bookingRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiPlan, ApiStation, ApiVehicleModelDetail } from '../types/api';

interface BookingDraft {
    // Full detail (not the list-item shape) so plan-selection can read
    // .plans directly without a second fetch.
    vehicleModel: ApiVehicleModelDetail | null;
    station: ApiStation | null;
    startDay: string | null; // YYYY-MM-DD — always today; pickup is immediate, no date picker
    plan: ApiPlan | null;
}

const EMPTY_DRAFT: BookingDraft = { vehicleModel: null, station: null, startDay: null, plan: null };

interface BookingState {
    draft: BookingDraft;
    loadingStation: boolean;
    stationError: string | null;

    setVehicleModel: (model: ApiVehicleModelDetail) => void;
    setStartDay: (day: string) => void;
    setPlan: (plan: ApiPlan) => void;
    loadNearestStation: (lat: number, lng: number) => Promise<void>;
    reset: () => void;
}

/**
 * Draft state for the book+pay screen. There is no `createBooking` any more:
 * a booking is created by the backend only after payment captures (pay-first).
 * The screen calls `billingRepository.createBookingOrder(...)` with these draft
 * fields to open checkout.
 */
export const useBookingStore = create<BookingState>((set) => ({
    draft: { ...EMPTY_DRAFT },
    loadingStation: false,
    stationError: null,

    setVehicleModel: (model) => set((s) => ({ draft: { ...s.draft, vehicleModel: model } })),
    setStartDay: (day) => set((s) => ({ draft: { ...s.draft, startDay: day } })),
    setPlan: (plan) => set((s) => ({ draft: { ...s.draft, plan } })),

    loadNearestStation: async (lat, lng) => {
        set({ loadingStation: true, stationError: null });
        try {
            const station = await bookingRepository.nearestStation(lat, lng);
            set((s) => ({ draft: { ...s.draft, station }, loadingStation: false }));
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not find a nearby pickup station.';
            set({ stationError: message, loadingStation: false });
        }
    },

    reset: () => set({ draft: { ...EMPTY_DRAFT } }),
}));
