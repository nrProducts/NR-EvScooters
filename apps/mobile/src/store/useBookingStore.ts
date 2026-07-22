import { create } from 'zustand';
import { bookingRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiBooking, ApiPlan, ApiStation, ApiVehicleModelDetail } from '../types/api';

interface BookingDraft {
    // Full detail (not the list-item shape) so plan-selection can read
    // .plans directly without a second fetch.
    vehicleModel: ApiVehicleModelDetail | null;
    station: ApiStation | null;
    startDay: string | null; // YYYY-MM-DD
    plan: ApiPlan | null;
}

const EMPTY_DRAFT: BookingDraft = { vehicleModel: null, station: null, startDay: null, plan: null };

interface BookingState {
    draft: BookingDraft;
    loadingStation: boolean;
    stationError: string | null;

    creating: boolean;
    createError: string | null;
    created: ApiBooking | null;

    setVehicleModel: (model: ApiVehicleModelDetail) => void;
    setStartDay: (day: string) => void;
    setPlan: (plan: ApiPlan) => void;
    loadNearestStation: (lat: number, lng: number) => Promise<void>;
    createBooking: () => Promise<ApiBooking>;
    reset: () => void;
}

export const useBookingStore = create<BookingState>((set, get) => ({
    draft: { ...EMPTY_DRAFT },
    loadingStation: false,
    stationError: null,

    creating: false,
    createError: null,
    created: null,

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

    createBooking: async () => {
        const { vehicleModel, station, startDay, plan } = get().draft;
        if (!vehicleModel || !station || !startDay || !plan) {
            throw new Error('Booking draft is incomplete.');
        }

        set({ creating: true, createError: null });
        try {
            const booking = await bookingRepository.create({
                vehicle_model_id: vehicleModel.id,
                station_id: station.id,
                plan_id: plan.id,
                start_day: startDay,
            });
            set({ creating: false, created: booking, draft: { ...EMPTY_DRAFT } });
            return booking;
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not create your booking.';
            set({ creating: false, createError: message });
            throw err;
        }
    },

    reset: () => set({ draft: { ...EMPTY_DRAFT }, created: null, createError: null }),
}));
