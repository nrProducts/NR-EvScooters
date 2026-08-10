/**
 * Great-circle distance helpers. Pure functions with no Supabase/express
 * imports so they stay unit-testable, and shared by the battery-station
 * radius filter and the "distance from me" projection.
 */

/** Mean Earth radius (IUGG). Same constant the mobile client uses. */
export const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

export interface LatLng {
    latitude: number;
    longitude: number;
}

/** Haversine distance in kilometres between two WGS-84 points. */
export function haversineKm(from: LatLng, to: LatLng): number {
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export const isValidLatitude = (value: number): boolean =>
    Number.isFinite(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value: number): boolean =>
    Number.isFinite(value) && value >= -180 && value <= 180;
