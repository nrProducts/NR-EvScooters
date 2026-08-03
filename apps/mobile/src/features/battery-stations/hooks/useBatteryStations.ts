import { useQuery } from '@tanstack/react-query';
import { getMobileStations, getStationById } from '../api/batteryStationService';
import { ApiError } from '../../../lib/ApiError';
import type { BatteryStation, BatteryStationFilters } from '../types/batteryStation.types';

export const BATTERY_STATIONS_QUERY_KEY = ['battery-stations'] as const;

/**
 * The station list for the map.
 *
 * staleTime is deliberately short (60 s): an admin hiding or moving a station
 * has to reach riders without an app release, so a pull-to-refresh or the next
 * screen focus must be able to pick the change up. Longer than that and the
 * console's "changes are live" promise stops being true.
 */
export function useBatteryStations(filters: BatteryStationFilters = {}) {
    const query = useQuery<BatteryStation[], ApiError>({
        queryKey: [...BATTERY_STATIONS_QUERY_KEY, filters],
        queryFn: () => getMobileStations(filters),
        staleTime: 60_000,
        // A 401 has already triggered the global sign-out, and a 400/403 will
        // fail identically however many times it's repeated — only transient
        // failures are worth a retry.
        retry: (failureCount, error) =>
            failureCount < 2 && (error.isOffline || error.status >= 500),
    });

    return {
        stations: query.data ?? [],
        isLoading: query.isLoading,
        isRefreshing: query.isRefetching,
        isError: query.isError,
        error: query.error ?? null,
        refetch: query.refetch,
        /** True only for the very first load, so the overlay shows once. */
        isInitialLoading: query.isLoading && !query.data,
    };
}

/**
 * One station, for the full-details screen. Seeded from the list cache when
 * it's already there, so arriving from the map renders instantly and the
 * network call only ever corrects it.
 */
export function useBatteryStation(id: string | undefined) {
    return useQuery<BatteryStation, ApiError>({
        queryKey: [...BATTERY_STATIONS_QUERY_KEY, 'detail', id],
        queryFn: () => getStationById(id!),
        enabled: !!id,
        staleTime: 60_000,
        retry: (failureCount, error) => failureCount < 2 && (error.isOffline || error.status >= 500),
    });
}
