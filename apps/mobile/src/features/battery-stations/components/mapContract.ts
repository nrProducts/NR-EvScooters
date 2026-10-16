import type { Coordinates } from '../utils/distance';
import type { BatteryStation } from '../types/batteryStation.types';

/**
 * The map's public shape, kept free of any maplibre import.
 *
 * BatteryStationMap (the wrapper) and BatteryStationMapView (the real
 * implementation, which does import maplibre) both depend on this file rather
 * than on each other, so the wrapper can be loaded without pulling the native
 * module in with it.
 */

/** The map opens on Chennai, where the whole network is, before any fix arrives. */
export const CHENNAI: Coordinates = { latitude: 13.0827, longitude: 80.2707 };

export const DEFAULT_ZOOM = 10.5;
export const FOCUS_ZOOM = 15;

export interface BatteryStationMapHandle {
    /** Animates to one station — used by search results and the sheet. */
    focusStation: (station: BatteryStation) => void;
    focusCoordinates: (coords: Coordinates, zoom?: number) => void;
    /** Frames every station currently on the map. */
    fitAll: () => void;
    zoomBy: (delta: number) => void;
}

export interface BatteryStationMapProps {
    stations: BatteryStation[];
    selectedStationId: string | null;
    onSelectStation: (stationId: string) => void;
    onPressMap: () => void;
    userCoords: Coordinates | null;
}
