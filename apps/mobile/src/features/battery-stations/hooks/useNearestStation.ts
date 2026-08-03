import { useMemo } from 'react';
import { findNearestWorkingStation, type Coordinates } from '../utils/distance';
import type { BatteryStation, StationWithDistance } from '../types/batteryStation.types';

/**
 * Nearest WORKING station to the rider, computed on-device with the Haversine
 * formula. Memoised on the list and the position so it recomputes only when
 * one of them actually changes — not on every camera move.
 *
 * Returns null when there's no position (permission denied) or no working
 * station in the list; the banner simply doesn't render in that case.
 */
export function useNearestStation(
    stations: BatteryStation[],
    origin: Coordinates | null,
): StationWithDistance | null {
    return useMemo(() => findNearestWorkingStation(stations, origin), [stations, origin]);
}
