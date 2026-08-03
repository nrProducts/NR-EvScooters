/**
 * Pure geo maths — no react-native import, so these stay importable from a
 * plain Vitest/node test (the same reason lib/maps.ts is structured this way).
 */

import type { BatteryStation, StationWithDistance } from "../types/batteryStation.types";

/** Mean Earth radius (IUGG). Matches apps/backend/src/common/geo.ts. */
export const EARTH_RADIUS_KM = 6371;

export interface Coordinates {
    latitude: number;
    longitude: number;
}

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Haversine great-circle distance in kilometres. */
export function haversineKm(from: Coordinates, to: Coordinates): number {
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const lat1 = toRadians(from.latitude);
    const lat2 = toRadians(to.latitude);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

    // Math.min guards against a floating-point a marginally above 1, which
    // would make Math.asin return NaN for two identical points.
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** "450 m" under a kilometre, "2.4 km" above it. */
export function formatDistance(km: number): string {
    if (!Number.isFinite(km) || km < 0) return "—";
    if (km < 1) return `${Math.round(km * 1000)} m`;
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km)} km`;
}

/**
 * Distance from the rider, or null when there is no position to measure from
 * (permission denied, or no fix yet). Every "x km away" in the UI goes through
 * here, so a denial degrades to a missing line rather than a wrong number.
 */
export function distanceOrNull(origin: Coordinates | null, target: Coordinates): number | null {
    return origin ? haversineKm(origin, target) : null;
}

export function withDistances(stations: BatteryStation[], origin: Coordinates): StationWithDistance[] {
    return stations.map((station) => ({
        ...station,
        distanceKm: haversineKm(origin, station),
    }));
}

/**
 * Nearest station a rider can actually swap at — WORKING only, because
 * routing someone to the closest dead cabinet is worse than routing them
 * 2 km further to a live one.
 *
 * Returns null when nothing qualifies, and also when `origin` is null: with
 * location permission denied there is no "nearest" to speak of, and that has
 * to be an ordinary answer rather than an error the map has to handle.
 */
export function findNearestWorkingStation(
    stations: BatteryStation[],
    origin: Coordinates | null,
): StationWithDistance | null {
    if (!origin) return null;

    const candidates = withDistances(
        stations.filter((s) => s.status === "WORKING"),
        origin,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((nearest, station) =>
        station.distanceKm < nearest.distanceKm ? station : nearest,
    );
}
