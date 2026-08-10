import { request } from '../../../lib/api';
import type {
    BatteryStation, BatteryStationFilters, BatteryStationListResponse,
} from '../types/batteryStation.types';

/**
 * The only place this feature talks to the network. Hooks call these; markers,
 * sheets and buttons never do. Goes through lib/api's `request`, so the auth
 * header, 20 s timeout, 401 sign-out and ApiError mapping are the same as the
 * rest of the app.
 *
 * Paths are relative to EXPO_PUBLIC_API_URL, which already includes /api/v1.
 */

/** GET /battery-stations — live + visible stations for the signed-in rider. */
export async function getMobileStations(filters: BatteryStationFilters = {}): Promise<BatteryStation[]> {
    const response = await request<BatteryStationListResponse>('/battery-stations', {
        query: {
            status: filters.status,
            search: filters.search?.trim() || undefined,
            latitude: filters.latitude,
            longitude: filters.longitude,
            radiusKm: filters.radiusKm,
        },
    });
    return response.data;
}

/** GET /battery-stations/:id — full detail for one station. */
export function getStationById(id: string): Promise<BatteryStation> {
    return request<BatteryStation>(`/battery-stations/${id}`);
}
