import { create } from 'zustand';
import { vehicleCatalogRepository } from '../services';
import { ApiError } from '../lib/ApiError';
import type { ApiVehicleModel, ListVehicleModelsParams, Pagination } from '../types/api';

interface VehicleCatalogState {
    featured: ApiVehicleModel | null;
    loadingFeatured: boolean;
    featuredError: string | null;

    list: ApiVehicleModel[];
    pagination: Pagination | null;
    filters: ListVehicleModelsParams;
    loadingList: boolean;
    listError: string | null;

    loadFeatured: () => Promise<void>;
    loadList: (params?: ListVehicleModelsParams) => Promise<void>;
    loadMore: () => Promise<void>;
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

    loadFeatured: async () => {
        set({ loadingFeatured: true, featuredError: null });
        try {
            const featured = await vehicleCatalogRepository.featured();
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
}));
