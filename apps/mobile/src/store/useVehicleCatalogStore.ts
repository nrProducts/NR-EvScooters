import { create } from 'zustand';
import { vehicleCatalogRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type {
    ApiVehicleModel, ApiVehicleModelDetail, ListVehicleModelsParams, Pagination,
} from '../types/api';

interface VehicleCatalogState {
    /**
     * Full detail, not the list shape: the Home card shows the complete
     * specification block, and /vehicle-models/featured only returns the
     * summary fields (no motor power, battery capacity or plans).
     */
    featured: ApiVehicleModelDetail | null;
    loadingFeatured: boolean;
    featuredError: string | null;

    list: ApiVehicleModel[];
    pagination: Pagination | null;
    filters: ListVehicleModelsParams;
    loadingList: boolean;
    listError: string | null;

    availableCount: number | null;
    loadingAvailableCount: boolean;

    loadFeatured: () => Promise<void>;
    loadList: (params?: ListVehicleModelsParams) => Promise<void>;
    loadMore: () => Promise<void>;
    loadAvailableCount: () => Promise<void>;
}

const DEFAULT_PAGE_SIZE = 10;

export const useVehicleCatalogStore = create<VehicleCatalogState>((set, get) => ({
    featured: null,
    loadingFeatured: false,
    featuredError: null,

    list: [],
    pagination: null,
    filters: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    loadingList: false,
    listError: null,

    availableCount: null,
    loadingAvailableCount: false,

    loadFeatured: async () => {
        set({ loadingFeatured: true, featuredError: null });
        try {
            const summary = await vehicleCatalogRepository.featured();
            // featured() 404s to null when no model is flagged.
            const featured = summary ? await vehicleCatalogRepository.get(summary.id) : null;
            set({ featured, loadingFeatured: false });
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not load the featured scooter.';
            set({ featuredError: message, loadingFeatured: false });
        }
    },

    loadList: async (params) => {
        const filters = { ...get().filters, ...params, page: 1 };
        set({ loadingList: true, listError: null, filters });
        try {
            const result = await vehicleCatalogRepository.list(filters);
            set({ list: result.data, pagination: result.pagination, loadingList: false });
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not load available vehicles.';
            set({ listError: message, loadingList: false });
        }
    },

    loadMore: async () => {
        const { pagination, filters, list, loadingList } = get();
        if (loadingList || !pagination || pagination.page >= pagination.totalPages) return;

        const nextFilters = { ...filters, page: pagination.page + 1 };
        set({ loadingList: true, filters: nextFilters });
        try {
            const result = await vehicleCatalogRepository.list(nextFilters);
            set({ list: [...list, ...result.data], pagination: result.pagination, loadingList: false });
        } catch (err) {
            const message = err instanceof ApiError ? err.message : 'Could not load more vehicles.';
            set({ listError: message, loadingList: false });
        }
    },

    loadAvailableCount: async () => {
        set({ loadingAvailableCount: true });
        try {
            const { available_count } = await vehicleCatalogRepository.availabilitySummary();
            set({ availableCount: available_count, loadingAvailableCount: false });
        } catch {
            set({ loadingAvailableCount: false });
        }
    },
}));
